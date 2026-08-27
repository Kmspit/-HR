import { describe, it, expect } from 'vitest'
import {
  isBlankProtectedField,
  PROTECTED_CLEAR_FIELDS,
  parseSelfProfileInput,
} from '@/lib/profile-update'

const validInput = {
  firstName: 'สมชาย',
  lastName: 'ใจดี',
  phone: '0812345678',
  email: 'somchai@example.com',
}

describe('PROTECTED_CLEAR_FIELDS / isBlankProtectedField', () => {
  it('declares nationalId, startDate, employeeId as protected', () => {
    expect(PROTECTED_CLEAR_FIELDS.has('nationalId')).toBe(true)
    expect(PROTECTED_CLEAR_FIELDS.has('startDate')).toBe(true)
    expect(PROTECTED_CLEAR_FIELDS.has('employeeId')).toBe(true)
  })

  it('is false for non-protected fields regardless of value', () => {
    expect(isBlankProtectedField('nickname', '')).toBe(false)
    expect(isBlankProtectedField('nickname', null)).toBe(false)
  })

  it('is true for a protected field with an absent/null/blank value', () => {
    expect(isBlankProtectedField('nationalId', undefined)).toBe(true)
    expect(isBlankProtectedField('nationalId', null)).toBe(true)
    expect(isBlankProtectedField('nationalId', '')).toBe(true)
    expect(isBlankProtectedField('nationalId', '   ')).toBe(true)
  })

  it('is false for a protected field with a real value', () => {
    expect(isBlankProtectedField('nationalId', '1234567890123')).toBe(false)
    expect(isBlankProtectedField('startDate', '2024-01-15')).toBe(false)
  })
})

describe('parseSelfProfileInput — nationalId omitted from data when blank, never written as null', () => {
  it('omits nationalId entirely when input is undefined', () => {
    const result = parseSelfProfileInput({ ...validInput })
    expect(result.ok).toBe(true)
    if (result.ok) expect('nationalId' in result.data).toBe(false)
  })

  it('omits nationalId entirely when input is an empty string', () => {
    const result = parseSelfProfileInput({ ...validInput, nationalId: '' })
    expect(result.ok).toBe(true)
    if (result.ok) expect('nationalId' in result.data).toBe(false)
  })

  it('omits nationalId entirely when input is null', () => {
    const result = parseSelfProfileInput({ ...validInput, nationalId: null })
    expect(result.ok).toBe(true)
    if (result.ok) expect('nationalId' in result.data).toBe(false)
  })

  it('sets a normalized nationalId when a valid 13-digit value is given', () => {
    const result = parseSelfProfileInput({ ...validInput, nationalId: '1-2345-67890-12-3' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.nationalId).toBe('1234567890123')
  })

  it('rejects a non-blank value that is not 13 digits', () => {
    const result = parseSelfProfileInput({ ...validInput, nationalId: '123' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('13 หลัก')
  })
})
