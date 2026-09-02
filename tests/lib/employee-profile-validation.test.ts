import { describe, it, expect } from 'vitest'
import {
  validateEmployeeProfile,
  employeeProfileHasErrors,
  isAddressBlank,
  firstEmployeeProfileError,
  coerceEmployeeProfileForm,
  type EmployeeProfileForm,
} from '@/lib/employee-profile-validation'
import type { RegisterAddress } from '@/lib/register-form-validation'

const EMPTY_ADDRESS: RegisterAddress = {
  houseNo: '', moo: '', soi: '', road: '', tambon: '', amphoe: '', province: '', postalCode: '',
}

const FULL_ADDRESS: RegisterAddress = {
  houseNo: '123', moo: '', soi: '', road: 'ถนนสุขุมวิท', tambon: 'คลองตัน', amphoe: 'วัฒนา', province: 'กรุงเทพมหานคร', postalCode: '10110',
}

function form(overrides: Partial<EmployeeProfileForm> = {}): EmployeeProfileForm {
  return {
    nationality: 'ไทย',
    maritalStatus: 'โสด',
    personalEmail: '',
    currentAddress: { ...EMPTY_ADDRESS },
    registeredAddress: { ...EMPTY_ADDRESS },
    sameAsCurrentAddress: false,
    ...overrides,
  }
}

describe('isAddressBlank', () => {
  it('is true when every field is empty', () => {
    expect(isAddressBlank(EMPTY_ADDRESS)).toBe(true)
  })

  it('is false when even one field has a value', () => {
    expect(isAddressBlank({ ...EMPTY_ADDRESS, houseNo: '1' })).toBe(false)
  })
})

describe('validateEmployeeProfile', () => {
  it('passes with everything blank — a legacy employee opening this tab for the first time', () => {
    const errors = validateEmployeeProfile(form())
    expect(employeeProfileHasErrors(errors)).toBe(false)
  })

  it('passes with a fully filled current address', () => {
    const errors = validateEmployeeProfile(form({ currentAddress: FULL_ADDRESS }))
    expect(employeeProfileHasErrors(errors)).toBe(false)
  })

  it('flags a partially filled current address as incomplete, not silently accepted', () => {
    const errors = validateEmployeeProfile(form({ currentAddress: { ...EMPTY_ADDRESS, houseNo: '123' } }))
    expect(employeeProfileHasErrors(errors)).toBe(true)
    expect(errors.currentAddress.road).toBeTruthy()
  })

  it('does not require moo/soi even when the rest of the address is filled', () => {
    const errors = validateEmployeeProfile(form({ currentAddress: FULL_ADDRESS }))
    expect(errors.currentAddress.moo).toBeUndefined()
    expect(errors.currentAddress.soi).toBeUndefined()
  })

  it('skips registeredAddress validation entirely when sameAsCurrentAddress is true, even if partial', () => {
    const errors = validateEmployeeProfile(form({
      sameAsCurrentAddress: true,
      registeredAddress: { ...EMPTY_ADDRESS, houseNo: '999' },
    }))
    expect(Object.keys(errors.registeredAddress)).toHaveLength(0)
  })

  it('validates registeredAddress when sameAsCurrentAddress is false and it is partially filled', () => {
    const errors = validateEmployeeProfile(form({
      sameAsCurrentAddress: false,
      registeredAddress: { ...EMPTY_ADDRESS, houseNo: '999' },
    }))
    expect(errors.registeredAddress.road).toBeTruthy()
  })

  it('rejects a malformed personalEmail', () => {
    const errors = validateEmployeeProfile(form({ personalEmail: 'not-an-email' }))
    expect(errors.personalEmail).toBeTruthy()
  })

  it('allows a blank personalEmail — it is optional', () => {
    const errors = validateEmployeeProfile(form({ personalEmail: '' }))
    expect(errors.personalEmail).toBeUndefined()
  })

  it('accepts a valid personalEmail', () => {
    const errors = validateEmployeeProfile(form({ personalEmail: 'me@example.com' }))
    expect(errors.personalEmail).toBeUndefined()
  })

  it('never validates nationality/maritalStatus — free-choice fields, same as the register wizard', () => {
    const errors = validateEmployeeProfile(form({ nationality: '', maritalStatus: '' }))
    expect(employeeProfileHasErrors(errors)).toBe(false)
  })
})

describe('firstEmployeeProfileError', () => {
  it('prefers the personalEmail error when present', () => {
    const errors = validateEmployeeProfile(form({
      personalEmail: 'bad',
      currentAddress: { ...EMPTY_ADDRESS, houseNo: '1' },
    }))
    expect(firstEmployeeProfileError(errors)).toBe(errors.personalEmail)
  })

  it('falls back to an address error when personalEmail is fine', () => {
    const errors = validateEmployeeProfile(form({ currentAddress: { ...EMPTY_ADDRESS, houseNo: '1' } }))
    expect(firstEmployeeProfileError(errors)).toBe(errors.currentAddress.road)
  })

  it('returns a generic message when errors is somehow empty', () => {
    expect(firstEmployeeProfileError({ currentAddress: {}, registeredAddress: {} })).toBe('ข้อมูลไม่ถูกต้อง')
  })
})

describe('coerceEmployeeProfileForm', () => {
  it('defaults every field safely when given garbage input', () => {
    const result = coerceEmployeeProfileForm(null)
    expect(result).toEqual(form({ nationality: '', maritalStatus: '' }))
  })

  it('extracts a well-shaped body correctly', () => {
    const body = {
      nationality: 'ไทย',
      maritalStatus: 'สมรส',
      personalEmail: 'a@b.com',
      currentAddress: FULL_ADDRESS,
      registeredAddress: EMPTY_ADDRESS,
      sameAsCurrentAddress: true,
    }
    const result = coerceEmployeeProfileForm(body)
    expect(result.nationality).toBe('ไทย')
    expect(result.currentAddress).toEqual(FULL_ADDRESS)
    expect(result.sameAsCurrentAddress).toBe(true)
  })

  it('ignores non-string fields rather than crashing (e.g. a client sending a number)', () => {
    const result = coerceEmployeeProfileForm({ nationality: 42, currentAddress: 'not-an-object' })
    expect(result.nationality).toBe('')
    expect(result.currentAddress).toEqual(EMPTY_ADDRESS)
  })
})
