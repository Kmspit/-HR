import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { encryptField, decryptField, FIELD_SALTS } from '@/lib/field-crypto'

describe('field-crypto', () => {
  const ORIGINAL_ENV = { ...process.env }

  beforeEach(() => {
    process.env.FACE_ENCRYPTION_SECRET = 'test-secret-for-field-crypto'
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('round-trips a value through encrypt then decrypt', () => {
    const value = '1234567890123'
    const enc = encryptField(value, FIELD_SALTS.DEPENDENT_NATIONAL_ID)
    expect(enc).not.toContain(value)
    expect(decryptField(enc, FIELD_SALTS.DEPENDENT_NATIONAL_ID)).toBe(value)
  })

  it('never leaks the plaintext into the ciphertext blob', () => {
    const value = 'sensitive-value-123456'
    const enc = encryptField(value, 'some-salt')
    expect(enc).not.toContain(value)
    expect(Buffer.from(enc, 'base64').toString('utf8')).not.toContain(value)
  })

  it('produces different ciphertext for the same value under different salts', () => {
    const value = '1234567890123'
    const encA = encryptField(value, 'salt-a')
    const encB = encryptField(value, 'salt-b')
    expect(encA).not.toBe(encB)
    expect(decryptField(encA, 'salt-a')).toBe(value)
    expect(decryptField(encB, 'salt-b')).toBe(value)
  })

  it('produces different ciphertext on each call (random IV) even for the same value+salt', () => {
    const value = '1234567890123'
    const encA = encryptField(value, FIELD_SALTS.DEPENDENT_NATIONAL_ID)
    const encB = encryptField(value, FIELD_SALTS.DEPENDENT_NATIONAL_ID)
    expect(encA).not.toBe(encB)
  })

  it('fails to decrypt with the wrong salt', () => {
    const enc = encryptField('1234567890123', FIELD_SALTS.DEPENDENT_NATIONAL_ID)
    expect(() => decryptField(enc, 'wrong-salt')).toThrow()
  })

  it('fails to decrypt tampered ciphertext (GCM auth tag catches it)', () => {
    const enc = encryptField('1234567890123', FIELD_SALTS.DEPENDENT_NATIONAL_ID)
    const buf = Buffer.from(enc, 'base64')
    buf[buf.length - 1] ^= 0xff // flip the last byte of the encrypted payload
    const tampered = buf.toString('base64')
    expect(() => decryptField(tampered, FIELD_SALTS.DEPENDENT_NATIONAL_ID)).toThrow()
  })

  it('keeps each FIELD_SALTS entry distinct', () => {
    const values = Object.values(FIELD_SALTS)
    expect(new Set(values).size).toBe(values.length)
  })

  it('round-trips both BankAccount fields under the shared BANK_ACCOUNT salt', () => {
    const name = 'สมชาย ใจดี'
    const number = '1234567890'
    const encName = encryptField(name, FIELD_SALTS.BANK_ACCOUNT)
    const encNumber = encryptField(number, FIELD_SALTS.BANK_ACCOUNT)
    expect(decryptField(encName, FIELD_SALTS.BANK_ACCOUNT)).toBe(name)
    expect(decryptField(encNumber, FIELD_SALTS.BANK_ACCOUNT)).toBe(number)
  })

  describe('derived-key caching (performance fix — deriveKey() no longer re-runs scryptSync on every call)', () => {
    it('repeated round-trips under the SAME salt keep working correctly many calls in a row', () => {
      const value = '1234567890123'
      for (let i = 0; i < 25; i++) {
        const enc = encryptField(`${value}-${i}`, FIELD_SALTS.DEPENDENT_NATIONAL_ID)
        expect(decryptField(enc, FIELD_SALTS.DEPENDENT_NATIONAL_ID)).toBe(`${value}-${i}`)
      }
    })

    it('interleaving calls across DIFFERENT salts never cross-contaminates the cached key', () => {
      for (let i = 0; i < 10; i++) {
        const a = encryptField(`a-${i}`, FIELD_SALTS.DEPENDENT_NATIONAL_ID)
        const b = encryptField(`b-${i}`, FIELD_SALTS.BANK_ACCOUNT)
        const c = encryptField(`c-${i}`, 'a-brand-new-salt')
        expect(decryptField(a, FIELD_SALTS.DEPENDENT_NATIONAL_ID)).toBe(`a-${i}`)
        expect(decryptField(b, FIELD_SALTS.BANK_ACCOUNT)).toBe(`b-${i}`)
        expect(decryptField(c, 'a-brand-new-salt')).toBe(`c-${i}`)
        // Cross-salt decryption must still fail even after both keys are cached.
        expect(() => decryptField(a, FIELD_SALTS.BANK_ACCOUNT)).toThrow()
      }
    })

    it('a value encrypted before the key was cached still decrypts correctly after many other salts warm the cache', () => {
      const first = encryptField('warm-up-value', FIELD_SALTS.DEPENDENT_NATIONAL_ID)
      for (let i = 0; i < 20; i++) {
        encryptField(`filler-${i}`, `filler-salt-${i}`)
      }
      expect(decryptField(first, FIELD_SALTS.DEPENDENT_NATIONAL_ID)).toBe('warm-up-value')
    })

    it('caching measurably speeds up repeated derivation for the same salt (the actual point of this change)', () => {
      // First call for a fresh salt pays the full scryptSync cost; every
      // subsequent call for that same salt should be dramatically cheaper.
      const salt = `perf-test-salt-${Date.now()}`
      const t0 = performance.now()
      encryptField('warm', salt)
      const firstCallMs = performance.now() - t0

      const t1 = performance.now()
      for (let i = 0; i < 10; i++) encryptField(`v${i}`, salt)
      const tenCachedCallsMs = performance.now() - t1

      // 10 cached calls should be much faster than even 1 uncached derivation —
      // a loose bound (not a tight timing assertion) to avoid CI flakiness.
      expect(tenCachedCallsMs).toBeLessThan(firstCallMs * 5)
    })
  })
})
