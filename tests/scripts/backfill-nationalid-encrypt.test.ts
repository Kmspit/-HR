import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  shouldSkipRow,
  verifyRoundTrip,
  processRow,
  parseBatchSize,
  runBatch,
  type BackfillRow,
} from '@/scripts/backfill-nationalid-encrypt'
import { encryptedNationalIdFields } from '@/lib/national-id'
import { encryptField, FIELD_SALTS } from '@/lib/field-crypto'

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  process.env.FACE_ENCRYPTION_SECRET = 'test-secret-for-backfill-script'
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

function baseRow(overrides: Partial<BackfillRow> = {}): BackfillRow {
  return {
    id: 'user-1',
    nationalId: '1101700207366',
    nationalIdEncrypted: null,
    nationalIdFp: null,
    ...overrides,
  }
}

function mockDb() {
  return {
    user: {
      update: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
  }
}

describe('shouldSkipRow', () => {
  it('skips when both new columns are already set', () => {
    expect(shouldSkipRow({ nationalIdEncrypted: 'enc', nationalIdFp: 'fp' })).toBe(true)
  })

  it('does not skip when either column is missing', () => {
    expect(shouldSkipRow({ nationalIdEncrypted: null, nationalIdFp: 'fp' })).toBe(false)
    expect(shouldSkipRow({ nationalIdEncrypted: 'enc', nationalIdFp: null })).toBe(false)
    expect(shouldSkipRow({ nationalIdEncrypted: null, nationalIdFp: null })).toBe(false)
  })
})

describe('verifyRoundTrip', () => {
  it('returns true when the ciphertext decrypts back to the original value', () => {
    const id = '1101700207366'
    const enc = encryptField(id, FIELD_SALTS.USER_NATIONAL_ID)
    expect(verifyRoundTrip(id, enc)).toBe(true)
  })

  it('returns false on a real mismatch (ciphertext for a different value)', () => {
    const enc = encryptField('3101999123453', FIELD_SALTS.USER_NATIONAL_ID)
    expect(verifyRoundTrip('1101700207366', enc)).toBe(false)
  })

  it('returns false (never throws) on a corrupted/undecryptable blob', () => {
    expect(() => verifyRoundTrip('1101700207366', 'not-a-real-ciphertext')).not.toThrow()
    expect(verifyRoundTrip('1101700207366', 'not-a-real-ciphertext')).toBe(false)
  })

  it('returns false when the ciphertext was encrypted under a different salt (wrong field)', () => {
    const enc = encryptField('1101700207366', FIELD_SALTS.DEPENDENT_NATIONAL_ID)
    expect(verifyRoundTrip('1101700207366', enc)).toBe(false)
  })
})

describe('processRow — skip cases', () => {
  it('skips a row that already has both new columns, without touching the DB', async () => {
    const db = mockDb()
    const row = baseRow({ nationalIdEncrypted: 'already-enc', nationalIdFp: 'already-fp' })
    const result = await processRow(db, row, { dryRun: false })
    expect(result).toEqual({ id: 'user-1', outcome: 'skipped' })
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it('skips a row with no nationalId at all (defensive — findMany already filters these out)', async () => {
    const db = mockDb()
    const row = baseRow({ nationalId: null })
    const result = await processRow(db, row, { dryRun: false })
    expect(result).toEqual({ id: 'user-1', outcome: 'skipped' })
    expect(db.user.update).not.toHaveBeenCalled()
  })
})

describe('processRow — dry-run mode', () => {
  it('verifies encryption in memory and never calls the DB', async () => {
    const db = mockDb()
    const row = baseRow()
    const result = await processRow(db, row, { dryRun: true })
    expect(result).toEqual({ id: 'user-1', outcome: 'success' })
    expect(db.user.update).not.toHaveBeenCalled()
    expect(db.user.findUniqueOrThrow).not.toHaveBeenCalled()
  })
})

describe('processRow — live write mode', () => {
  it('writes both columns, re-reads fresh from the DB, and reports success when it matches', async () => {
    const db = mockDb()
    const row = baseRow()
    const enc = encryptedNationalIdFields(row.nationalId as string)
    db.user.findUniqueOrThrow.mockResolvedValue({
      nationalId: row.nationalId,
      nationalIdEncrypted: enc.nationalIdEncrypted,
    })

    const result = await processRow(db, row, { dryRun: false })

    expect(result).toEqual({ id: 'user-1', outcome: 'success' })
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: expect.objectContaining({ nationalIdEncrypted: expect.any(String), nationalIdFp: expect.any(String) }),
    })
    expect(db.user.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { nationalId: true, nationalIdEncrypted: true },
    })
  })

  it('reports an error (not a thrown exception) when the re-read row fails to decrypt back to the original', async () => {
    const db = mockDb()
    const row = baseRow()
    // Simulate a corrupted write — the re-read ciphertext decrypts to something else.
    db.user.findUniqueOrThrow.mockResolvedValue({
      nationalId: row.nationalId,
      nationalIdEncrypted: encryptField('9999999999999', FIELD_SALTS.USER_NATIONAL_ID),
    })

    const result = await processRow(db, row, { dryRun: false })
    expect(result.outcome).toBe('error')
    if (result.outcome === 'error') {
      expect(result.reason).toContain('post-write verify failed')
    }
  })

  it('reports an error when nationalIdEncrypted comes back empty after the write', async () => {
    const db = mockDb()
    const row = baseRow()
    db.user.findUniqueOrThrow.mockResolvedValue({ nationalId: row.nationalId, nationalIdEncrypted: null })

    const result = await processRow(db, row, { dryRun: false })
    expect(result.outcome).toBe('error')
    if (result.outcome === 'error') {
      expect(result.reason).toContain('empty after write')
    }
  })

  it('reports an error if nationalId itself came back empty after the write (this script must never cause that)', async () => {
    const db = mockDb()
    const row = baseRow()
    db.user.findUniqueOrThrow.mockResolvedValue({
      nationalId: null,
      nationalIdEncrypted: encryptField(row.nationalId as string, FIELD_SALTS.USER_NATIONAL_ID),
    })

    const result = await processRow(db, row, { dryRun: false })
    expect(result.outcome).toBe('error')
    if (result.outcome === 'error') {
      expect(result.reason).toContain('nationalId became empty')
    }
  })

  it('never sends the plaintext nationalId itself in the update payload', async () => {
    const db = mockDb()
    const row = baseRow()
    db.user.findUniqueOrThrow.mockResolvedValue({
      nationalId: row.nationalId,
      nationalIdEncrypted: encryptedNationalIdFields(row.nationalId as string).nationalIdEncrypted,
    })

    await processRow(db, row, { dryRun: false })
    const data = db.user.update.mock.calls[0][0].data as Record<string, unknown>
    expect(data).not.toHaveProperty('nationalId')
    expect(JSON.stringify(data)).not.toContain(row.nationalId as string)
  })
})

describe('parseBatchSize', () => {
  it('defaults to 1 when no --batch-size flag is present', () => {
    expect(parseBatchSize([])).toBe(1)
    expect(parseBatchSize(['node', 'scripts/backfill-nationalid-encrypt.ts'])).toBe(1)
  })

  it('parses a valid --batch-size=N flag', () => {
    expect(parseBatchSize(['--batch-size=25'])).toBe(25)
    expect(parseBatchSize(['--dry-run', '--batch-size=5'])).toBe(5)
  })

  it('falls back to 1 for a non-numeric, zero, or negative value', () => {
    expect(parseBatchSize(['--batch-size=abc'])).toBe(1)
    expect(parseBatchSize(['--batch-size=0'])).toBe(1)
    expect(parseBatchSize(['--batch-size=-5'])).toBe(1)
    expect(parseBatchSize(['--batch-size=1.5'])).toBe(1)
  })
})

/**
 * A tiny in-memory fake standing in for prisma — filters/updates rows the
 * same way the real PENDING_WHERE query would, so runBatch() tests exercise
 * genuine "fetch pending, write, re-check pending" behavior rather than just
 * asserting on mock call shapes.
 */
type FakeRow = { id: string; nationalId: string | null; nationalIdEncrypted: string | null; nationalIdFp: string | null }

function isPending(row: FakeRow): boolean {
  return row.nationalId != null && (row.nationalIdEncrypted == null || row.nationalIdFp == null)
}

function makeFakeDb(rows: FakeRow[]) {
  const store = new Map(rows.map((r) => [r.id, { ...r }]))
  return {
    user: {
      findMany: vi.fn(async ({ take }: { take: number }) =>
        [...store.values()]
          .filter(isPending)
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
          .slice(0, take)
          .map((r) => ({ ...r })),
      ),
      count: vi.fn(async () => [...store.values()].filter(isPending).length),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = store.get(where.id)
        if (row) Object.assign(row, data)
      }),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = store.get(where.id)
        if (!row) throw new Error('not found')
        return { nationalId: row.nationalId, nationalIdEncrypted: row.nationalIdEncrypted }
      }),
    },
  }
}

describe('runBatch — batch-size + rerun behavior', () => {
  const ORIGINAL_ENV = { ...process.env }

  beforeEach(() => {
    process.env.FACE_ENCRYPTION_SECRET = 'test-secret-for-backfill-script'
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  const threeRows: FakeRow[] = [
    { id: 'u1', nationalId: '1101700207366', nationalIdEncrypted: null, nationalIdFp: null },
    { id: 'u2', nationalId: '3101999123453', nationalIdEncrypted: null, nationalIdFp: null },
    { id: 'u3', nationalId: '1234567890124', nationalIdEncrypted: null, nationalIdFp: null },
  ]

  it('processes exactly batchSize rows and reports how many pending rows remain', async () => {
    const db = makeFakeDb(threeRows)
    const summary = await runBatch(db, 2, false)
    expect(summary.processed).toBe(2)
    expect(summary.succeeded).toBe(2)
    expect(summary.errors).toEqual([])
    expect(summary.remaining).toBe(1)
  })

  it('never processes more than batchSize rows even when more are pending', async () => {
    const db = makeFakeDb(threeRows)
    await runBatch(db, 1, false)
    expect(db.user.update).toHaveBeenCalledTimes(1)
  })

  it('rerunning the same command automatically advances to the next pending rows, without overlap', async () => {
    const db = makeFakeDb(threeRows)

    const first = await runBatch(db, 2, false)
    expect(first.processed).toBe(2)
    expect(first.remaining).toBe(1)

    const second = await runBatch(db, 2, false)
    expect(second.processed).toBe(1) // only u3 was still pending
    expect(second.remaining).toBe(0)

    const firstIds = db.user.update.mock.calls.slice(0, 2).map((c) => c[0].where.id)
    const secondIds = db.user.update.mock.calls.slice(2).map((c) => c[0].where.id)
    expect(new Set(firstIds).size + new Set(secondIds).size).toBe(3)
    expect([...firstIds, ...secondIds].sort()).toEqual(['u1', 'u2', 'u3'])
  })

  it('a third call after everything is done processes zero rows and reports zero remaining', async () => {
    const db = makeFakeDb(threeRows)
    await runBatch(db, 3, false)
    const third = await runBatch(db, 3, false)
    expect(third.processed).toBe(0)
    expect(third.remaining).toBe(0)
    expect(third.errors).toEqual([])
  })

  it('dry-run never advances state — rerunning the same dry-run command processes the SAME batch every time', async () => {
    const db = makeFakeDb(threeRows)
    const first = await runBatch(db, 1, true)
    const second = await runBatch(db, 1, true)
    expect(first.remaining).toBe(3)
    expect(second.remaining).toBe(3)
    expect(db.user.update).not.toHaveBeenCalled()
  })
})
