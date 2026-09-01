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
})
