import { describe, it, expect } from 'vitest'
import { validateSelfProfileForm } from '@/lib/profile-validators-client'

// Checksum-valid synthetic test vectors (see tests/lib/national-id.test.ts) — not
// real people's IDs.
const VALID_NATIONAL_ID = '1101700207366'
const VALID_NATIONAL_ID_2 = '3101999123453'

function yearsAgo(years: number): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  return d.toISOString().slice(0, 10)
}

const validForm = {
  firstName: 'สมชาย', email: 'somchai@co.com', phone: '0812345678', lineId: '@somchai',
}

describe('validateSelfProfileForm — backlog 4.1: nationalId checksum, only on actual change', () => {
  it('rejects a format-valid (13-digit) but checksum-invalid nationalId when it differs from the original', () => {
    const e = validateSelfProfileForm(
      { ...validForm, nationalId: '1234567890123' },
      { nationalId: VALID_NATIONAL_ID },
    )
    expect(e.nationalId).toContain('เลขตรวจสอบไม่ตรง')
  })

  it('does NOT re-validate checksum when the value is unchanged from the original, even if that original is itself checksum-invalid', () => {
    const e = validateSelfProfileForm(
      { ...validForm, nationalId: '1234567890123' },
      { nationalId: '1234567890123' },
    )
    expect(e.nationalId).toBeUndefined()
  })

  it('accepts a checksum-valid, changed nationalId', () => {
    const e = validateSelfProfileForm(
      { ...validForm, nationalId: VALID_NATIONAL_ID_2 },
      { nationalId: VALID_NATIONAL_ID },
    )
    expect(e.nationalId).toBeUndefined()
  })

  it('behaves the same with no `original` argument at all (treated as changed)', () => {
    const e = validateSelfProfileForm({ ...validForm, nationalId: '1234567890123' })
    expect(e.nationalId).toContain('เลขตรวจสอบไม่ตรง')
  })
})

describe('validateSelfProfileForm — backlog 4.9: birthDate age-range, only on actual change', () => {
  it('rejects a birthDate that would make the applicant 5 years old when it differs from the original', () => {
    const e = validateSelfProfileForm(
      { ...validForm, birthDate: yearsAgo(5) },
      { birthDate: yearsAgo(30) },
    )
    expect(e.birthDate).toContain('15-80')
  })

  it('rejects a birthDate that would make the applicant 100 years old', () => {
    const e = validateSelfProfileForm({ ...validForm, birthDate: yearsAgo(100) }, { birthDate: '' })
    expect(e.birthDate).toContain('15-80')
  })

  it('accepts a reasonable birthDate (age 30)', () => {
    const e = validateSelfProfileForm({ ...validForm, birthDate: yearsAgo(30) }, { birthDate: '' })
    expect(e.birthDate).toBeUndefined()
  })

  it('does NOT re-validate age when the birthDate is unchanged from the original, even if that original is itself out of range', () => {
    const outOfRange = yearsAgo(100)
    const e = validateSelfProfileForm(
      { ...validForm, birthDate: outOfRange },
      { birthDate: outOfRange },
    )
    expect(e.birthDate).toBeUndefined()
  })

  it('leaves birthDate optional — blank is not an error', () => {
    const e = validateSelfProfileForm({ ...validForm, birthDate: '' })
    expect(e.birthDate).toBeUndefined()
  })
})
