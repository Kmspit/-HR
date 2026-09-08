import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  shouldSkipRow,
  verifyRoundTrip,
  processRow,
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
