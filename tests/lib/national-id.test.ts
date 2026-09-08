import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { maskNationalId, nationalIdFingerprint, isValidThaiNationalIdChecksum, encryptedNationalIdFields } from '@/lib/national-id'
import { decryptField, FIELD_SALTS } from '@/lib/field-crypto'

describe('maskNationalId — never throws, reveals at most the last digit', () => {
  it('masks a valid 13-digit id, keeping only the last digit', () => {
    expect(maskNationalId('1234567890123')).toEqual({
      status: 'MASKED',
      display: 'x-xxxx-xxxxx-xx-3',
    })
  })

  it('strips non-digit formatting before masking', () => {
    expect(maskNationalId('1-2345-67890-12-3')).toEqual({
      status: 'MASKED',
      display: 'x-xxxx-xxxxx-xx-3',
    })
  })

  it('reports MISSING for null/undefined/empty — distinct from a bad value', () => {
    expect(maskNationalId(null)).toEqual({ status: 'MISSING', display: 'ยังไม่ได้กรอก' })
    expect(maskNationalId(undefined)).toEqual({ status: 'MISSING', display: 'ยังไม่ได้กรอก' })
    expect(maskNationalId('')).toEqual({ status: 'MISSING', display: 'ยังไม่ได้กรอก' })
    expect(maskNationalId('   ')).toEqual({ status: 'MISSING', display: 'ยังไม่ได้กรอก' })
  })

  it('reports INVALID when digits present but count != 13', () => {
    expect(maskNationalId('123')).toEqual({ status: 'INVALID', display: 'ข้อมูลไม่ถูกต้อง' })
    expect(maskNationalId('123456789012')).toEqual({ status: 'INVALID', display: 'ข้อมูลไม่ถูกต้อง' })
    expect(maskNationalId('12345678901234')).toEqual({ status: 'INVALID', display: 'ข้อมูลไม่ถูกต้อง' })
  })

  it('never throws on garbage input, reports INVALID', () => {
    expect(() => maskNationalId('not-a-number')).not.toThrow()
    expect(maskNationalId('not-a-number')).toEqual({ status: 'INVALID', display: 'ข้อมูลไม่ถูกต้อง' })
  })
})

describe('nationalIdFingerprint — distinguishes values that mask identically', () => {
  it('two ids sharing a last digit produce the same masked display but different fingerprints', () => {
    const a = '1234567890123'
    const b = '9999999999993'
    expect(maskNationalId(a).display).toBe(maskNationalId(b).display) // both end in 3
    expect(nationalIdFingerprint(a)).not.toBe(nationalIdFingerprint(b))
  })

  it('is stable for the same digits regardless of formatting', () => {
    expect(nationalIdFingerprint('1234567890123')).toBe(nationalIdFingerprint('1-2345-67890-12-3'))
  })

  it('returns null for blank/null/undefined — never a fingerprint of nothing', () => {
    expect(nationalIdFingerprint(null)).toBeNull()
    expect(nationalIdFingerprint(undefined)).toBeNull()
    expect(nationalIdFingerprint('')).toBeNull()
  })

  it('never reveals the original digits in its output', () => {
    const fp = nationalIdFingerprint('1234567890123')
    expect(fp).not.toContain('1234567890123')
    expect(fp).toMatch(/^[0-9a-f]{12}$/)
  })
})

describe('isValidThaiNationalIdChecksum — กรมการปกครอง check digit formula', () => {
  // Synthetic test vector verified by hand against the published formula — not a real
  // person's ID. sum of digit[i]*(13-i) for i=0..11 = 159; 159%11=5; (11-5)%10=6 = digit[12].
  const VALID_ID = '1101700207366'

  it('accepts a number whose 13th digit matches the computed check digit', () => {
    expect(isValidThaiNationalIdChecksum(VALID_ID)).toBe(true)
  })

  it('rejects the same number with two interior digits transposed', () => {
    // Swap positions 4 and 5 (1-indexed): 1101700207366 -> 1107100207366.
    // Recomputed sum=165, 165%11=0, checkDigit=1, but the 13th digit is still 6 -> mismatch.
    expect(isValidThaiNationalIdChecksum('1107100207366')).toBe(false)
  })

  it('rejects a repeated-digit number (1111111111111)', () => {
    expect(isValidThaiNationalIdChecksum('1111111111111')).toBe(false)
  })

  it('rejects anything that is not exactly 13 digits', () => {
    expect(isValidThaiNationalIdChecksum('123')).toBe(false)
    expect(isValidThaiNationalIdChecksum('12345678901234')).toBe(false)
    expect(isValidThaiNationalIdChecksum('')).toBe(false)
    expect(isValidThaiNationalIdChecksum(null)).toBe(false)
    expect(isValidThaiNationalIdChecksum(undefined)).toBe(false)
  })

  it('strips non-digit formatting before checking, same as maskNationalId', () => {
    expect(isValidThaiNationalIdChecksum('1-1017-00207-36-6')).toBe(true)
  })

  it('rejects a format-valid (13-digit) number whose check digit is simply wrong', () => {
    // Confirms this is a stricter check than maskNationalId's format-only rule —
    // maskNationalId(a purely sequential id) already treats this exact value as
    // well-formed (see national-id.test.ts above), which is the whole point of
    // keeping the two functions separate.
    expect(isValidThaiNationalIdChecksum('1234567890123')).toBe(false)
  })
})

describe('encryptedNationalIdFields — nationalId-encryption Phase 1 dual-write helper', () => {
  const ORIGINAL_ENV = { ...process.env }

  beforeEach(() => {
    process.env.FACE_ENCRYPTION_SECRET = 'test-secret-for-national-id'
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('round-trips: nationalIdEncrypted decrypts back to the original digits', () => {
    const id = '1101700207366'
    const { nationalIdEncrypted } = encryptedNationalIdFields(id)
    expect(nationalIdEncrypted).not.toContain(id)
    expect(decryptField(nationalIdEncrypted, FIELD_SALTS.USER_NATIONAL_ID)).toBe(id)
  })

  it('nationalIdFp matches nationalIdFingerprint() for the same input', () => {
    const id = '1101700207366'
    expect(encryptedNationalIdFields(id).nationalIdFp).toBe(nationalIdFingerprint(id))
  })

  it('same id encrypted twice produces different ciphertext (random IV) but the same fingerprint', () => {
    const id = '1101700207366'
    const a = encryptedNationalIdFields(id)
    const b = encryptedNationalIdFields(id)
    expect(a.nationalIdEncrypted).not.toBe(b.nationalIdEncrypted)
    expect(a.nationalIdFp).toBe(b.nationalIdFp)
  })

  it('different ids produce different fingerprints — duplicate detection still distinguishes them', () => {
    const a = encryptedNationalIdFields('1101700207366')
    const b = encryptedNationalIdFields('3101999123453')
    expect(a.nationalIdFp).not.toBe(b.nationalIdFp)
  })

  it('is encrypted under a salt distinct from the Dependent/BankAccount fields (key isolation)', () => {
    const id = '1101700207366'
    const { nationalIdEncrypted } = encryptedNationalIdFields(id)
    expect(() => decryptField(nationalIdEncrypted, FIELD_SALTS.DEPENDENT_NATIONAL_ID)).toThrow()
    expect(() => decryptField(nationalIdEncrypted, FIELD_SALTS.BANK_ACCOUNT)).toThrow()
  })
})
