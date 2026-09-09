import { describe, it, expect, vi } from 'vitest'
import { purgeUser, purgeUserInTransaction, shouldBlockPurge } from '@/scripts/purge-user.mjs'

function makeModelMock() {
  return {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    delete: vi.fn().mockResolvedValue({ id: 'user-1' }),
  }
}

/**
 * Auto-vivifying fake Prisma client — purgeUser() touches ~30 models, one
 * deleteMany/updateMany call at a time. Rather than hand-listing every one
 * (most of which aren't the point of any single test), this stubs a fresh
 * model mock the first time each is accessed, with safe defaults (empty
 * arrays, zero counts) so the full function runs to completion without
 * crashing — then a test grabs the one model it cares about (e.g.
 * db.loginAttempt) to assert on the exact call that matters to it.
 */
function makeFakeDb() {
  const models = new Map<string, ReturnType<typeof makeModelMock>>()
  return new Proxy({} as Record<string, ReturnType<typeof makeModelMock>>, {
    get(_target, prop: string) {
      if (!models.has(prop)) models.set(prop, makeModelMock())
      return models.get(prop)
    },
  })
}

describe('shouldBlockPurge — --force-guard flag behavior', () => {
  it('does not block a clean account (no guard blockers) regardless of the flag', () => {
    expect(shouldBlockPurge([], false)).toBe(false)
    expect(shouldBlockPurge([], true)).toBe(false)
  })

  it('blocks when there are guard blockers and --force-guard was NOT passed (default, unchanged behavior)', () => {
    expect(shouldBlockPurge([{ label: 'payroll', count: 1 }], false)).toBe(true)
  })

  it('does NOT block when there are guard blockers but --force-guard WAS passed', () => {
    expect(shouldBlockPurge([{ label: 'payroll', count: 1 }], true)).toBe(false)
  })

  it('still blocks with multiple blockers present and no flag', () => {
    expect(
      shouldBlockPurge(
        [
          { label: 'payroll', count: 3 },
          { label: 'warnings (เอกสารวินัย)', count: 1 },
        ],
        false,
      ),
    ).toBe(true)
  })
})

describe('purgeUser — the 3 tables added by the --force-guard hardening pass (previously untested)', () => {
  it('deletes login_attempts for this user', async () => {
    const db = makeFakeDb()
    await purgeUser(db, 'user-1')
    expect(db.loginAttempt.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } })
  })

  it('deletes security_events for this user', async () => {
    const db = makeFakeDb()
    await purgeUser(db, 'user-1')
    expect(db.securityEvent.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } })
  })

  it('deletes calendar_events created by this user', async () => {
    const db = makeFakeDb()
    await purgeUser(db, 'user-1')
    expect(db.calendarEvent.deleteMany).toHaveBeenCalledWith({ where: { createdById: 'user-1' } })
  })
})

describe('purgeUser — 2026-09-09 FK-gap fix: the 2 nullable columns get cleared', () => {
  it('nulls billing_invoices.approvedById for this user, not the row itself', async () => {
    const db = makeFakeDb()
    await purgeUser(db, 'user-1')
    expect(db.billingInvoice.updateMany).toHaveBeenCalledWith({
      where: { approvedById: 'user-1' },
      data: { approvedById: null },
    })
    expect(db.billingInvoice.deleteMany).not.toHaveBeenCalled()
  })

  it('nulls billing_payments.receivedById for this user, not the row itself', async () => {
    const db = makeFakeDb()
    await purgeUser(db, 'user-1')
    expect(db.billingPayment.updateMany).toHaveBeenCalledWith({
      where: { receivedById: 'user-1' },
      data: { receivedById: null },
    })
    expect(db.billingPayment.deleteMany).not.toHaveBeenCalled()
  })

  it('still deletes the user row itself at the end', async () => {
    const db = makeFakeDb()
    await purgeUser(db, 'user-1')
    expect(db.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } })
  })
})

describe('purgeUser — attendance_face_scans now cascades via real FK (v900035), no manual delete needed', () => {
  it('never calls db.attendanceFaceScan.deleteMany — the DB cascades it automatically on user delete', async () => {
    const db = makeFakeDb()
    await purgeUser(db, 'user-1')
    expect(db.attendanceFaceScan.deleteMany).not.toHaveBeenCalled()
  })

  it('still deletes the user row itself, which is what triggers the cascade', async () => {
    const db = makeFakeDb()
    await purgeUser(db, 'user-1')
    expect(db.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } })
  })
})

describe('purgeUser — biometric_consents (PDPA evidence) is deliberately left untouched', () => {
  it('never calls any method on db.biometricConsent', async () => {
    const db = makeFakeDb()
    await purgeUser(db, 'user-1')
    expect(db.biometricConsent.deleteMany).not.toHaveBeenCalled()
    expect(db.biometricConsent.updateMany).not.toHaveBeenCalled()
    expect(db.biometricConsent.delete).not.toHaveBeenCalled()
  })

  it('succeeds (and still deletes the user row) even when the user has existing consent rows — the orphaned row is left behind on purpose, not an accidental miss', async () => {
    const db = makeFakeDb()
    await expect(purgeUser(db, 'user-1')).resolves.toBeTruthy()
    expect(db.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } })
    expect(db.biometricConsent.deleteMany).not.toHaveBeenCalled()
  })
})

describe('purgeUserInTransaction — DryRunAbort / transaction rollback wiring', () => {
  it('dry-run (rollback: true): returns purgeUser\'s counts, DryRunAbort never escapes to the caller', async () => {
    const tx = makeFakeDb()
    const db = { $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(tx)) }
    const counts = (await purgeUserInTransaction(db, 'user-1', { rollback: true })) as Record<string, number>
    expect(counts.login_attempts).toBe(0)
    expect(db.$transaction).toHaveBeenCalledTimes(1)
  })

  it('dry-run (rollback: true): a genuine error from inside the transaction is NOT swallowed as a DryRunAbort — it still propagates', async () => {
    const db = { $transaction: vi.fn(async () => { throw new Error('some real db error') }) }
    await expect(purgeUserInTransaction(db, 'user-1', { rollback: true })).rejects.toThrow('some real db error')
  })

  it('real run (rollback: false): runs purgeUser inside one $transaction call and returns its counts', async () => {
    const tx = makeFakeDb()
    const db = { $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(tx)) }
    const counts = (await purgeUserInTransaction(db, 'user-1', { rollback: false })) as Record<string, number>
    expect(counts.login_attempts).toBe(0)
    expect(db.$transaction).toHaveBeenCalledTimes(1)
  })

  it('real run (rollback: false): a genuine mid-purge error (e.g. an FK violation the guard missed) propagates instead of leaving a half-deleted account', async () => {
    const db = { $transaction: vi.fn(async () => { throw new Error('FOREIGN KEY constraint failed') }) }
    await expect(purgeUserInTransaction(db, 'user-1', { rollback: false })).rejects.toThrow('FOREIGN KEY constraint failed')
  })
})
