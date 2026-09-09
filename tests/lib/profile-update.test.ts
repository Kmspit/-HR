import { describe, it, expect } from 'vitest'
import {
  isBlankProtectedField,
  PROTECTED_CLEAR_FIELDS,
  SELF_PROFILE_FORBIDDEN,
  parseSelfProfileInput,
  isReasonableBirthDate,
  MIN_EMPLOYEE_AGE,
  MAX_EMPLOYEE_AGE,
} from '@/lib/profile-update'

function yearsAgo(years: number): Date {
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  return d
}

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

describe('SELF_PROFILE_FORBIDDEN — employee-fields batch 1 (2026-09-09)', () => {
  it('declares jobLevel and socialSecurityNumber as HR-only, not self-editable', () => {
    expect(SELF_PROFILE_FORBIDDEN.has('jobLevel')).toBe(true)
    expect(SELF_PROFILE_FORBIDDEN.has('socialSecurityNumber')).toBe(true)
  })
})

describe('isReasonableBirthDate — backlog 4.9', () => {
  it(`rejects an age below ${MIN_EMPLOYEE_AGE} (a real incident: today's date typed as birthday)`, () => {
    expect(isReasonableBirthDate(new Date())).toBe(false)
    expect(isReasonableBirthDate(yearsAgo(5))).toBe(false)
    expect(isReasonableBirthDate(yearsAgo(14))).toBe(false)
  })

  it(`rejects an age above ${MAX_EMPLOYEE_AGE}`, () => {
    expect(isReasonableBirthDate(yearsAgo(81))).toBe(false)
    expect(isReasonableBirthDate(yearsAgo(100))).toBe(false)
  })

  it('accepts ages comfortably within the range', () => {
    expect(isReasonableBirthDate(yearsAgo(16))).toBe(true)
    expect(isReasonableBirthDate(yearsAgo(79))).toBe(true)
    expect(isReasonableBirthDate(yearsAgo(30))).toBe(true)
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
