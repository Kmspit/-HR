import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { auditLog: { create: mocks.create } } }))
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }))

import { createAuditLog } from '@/lib/notifications'

describe('createAuditLog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepts a null actorId with an actorLabel (system/cron actions)', async () => {
    mocks.create.mockResolvedValue({ id: 'log-1' })
    await createAuditLog({
      actorId: null,
      actorLabel: 'cron:auto-checkout',
      targetId: 'att-1',
      targetType: 'Attendance',
      action: 'UPDATE',
    })
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actorId: null, actorLabel: 'cron:auto-checkout' }),
      }),
    )
    expect(mocks.captureException).not.toHaveBeenCalled()
  })

  it('still works with a real actorId (unchanged human-action behavior)', async () => {
    mocks.create.mockResolvedValue({ id: 'log-2' })
    await createAuditLog({ actorId: 'user-1', targetId: 'emp-1', targetType: 'User', action: 'UPDATE' })
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actorId: 'user-1' }) }),
    )
  })

  it('does not throw when the DB write fails, and reports it to Sentry instead of only console.error', async () => {
    const dbError = new Error('SQLITE_CONSTRAINT: FOREIGN KEY constraint failed')
    mocks.create.mockRejectedValue(dbError)

    await expect(
      createAuditLog({ actorId: 'bad-id', targetId: 'x', targetType: 'User', action: 'UPDATE' }),
    ).resolves.toBeUndefined()

    expect(mocks.captureException).toHaveBeenCalledWith(
      dbError,
      expect.objectContaining({ tags: expect.objectContaining({ action: 'UPDATE', targetType: 'User' }) }),
    )
  })
})
