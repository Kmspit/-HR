import { describe, it, expect } from 'vitest'
import {
  validateRegisterPersonalStep,
  validateRegisterAddress,
  validateRegisterAddressStep,
  addressStepHasErrors,
  copyAddressIfSame,
  validateRegisterEmergencyContacts,
  emergencyContactsStepHasErrors,
  validateRegisterEmployeeStep,
  validateRegisterPasswordStep,
  MAX_REGISTER_EMERGENCY_CONTACTS,
  type RegisterAddress,
  type RegisterEmergencyContact,
} from '@/lib/register-form-validation'

const validPersonal = {
  branchId: 'b1', firstName: 'สมชาย', lastName: 'ใจดี',
  email: 'somchai@example.com', phone: '0812345678', lineId: '@somchai',
  nationalId: '1234567890123',
}

describe('validateRegisterPersonalStep', () => {
  it('passes with all valid fields', () => {
    expect(validateRegisterPersonalStep(validPersonal)).toEqual({})
  })

  it('requires nationalId now (was optional pre-Phase-1)', () => {
    const e = validateRegisterPersonalStep({ ...validPersonal, nationalId: '' })
    expect(e.nationalId).toBeTruthy()
  })

  it('rejects a nationalId that is not exactly 13 digits', () => {
    const e = validateRegisterPersonalStep({ ...validPersonal, nationalId: '123' })
    expect(e.nationalId).toBeTruthy()
  })

  it('flags each required field independently when blank', () => {
    const e = validateRegisterPersonalStep({
      branchId: '', firstName: '', lastName: '', email: '', phone: '', lineId: '', nationalId: '',
    })
    expect(Object.keys(e).sort()).toEqual(
      ['branchId', 'email', 'firstName', 'lastName', 'lineId', 'nationalId', 'phone'].sort(),
    )
  })

  it('rejects an invalid email format', () => {
    const e = validateRegisterPersonalStep({ ...validPersonal, email: 'not-an-email' })
    expect(e.email).toBeTruthy()
  })

  it('rejects a phone number that is not 10 digits starting with 0', () => {
    const e = validateRegisterPersonalStep({ ...validPersonal, phone: '123' })
    expect(e.phone).toBeTruthy()
  })
})

const validAddress: RegisterAddress = {
  houseNo: '123', moo: '4', soi: 'สุขุมวิท 5', road: 'สุขุมวิท',
  tambon: 'คลองเตย', amphoe: 'คลองเตย', province: 'กรุงเทพมหานคร', postalCode: '10110',
}

describe('validateRegisterAddress', () => {
  it('passes with all 8 sub-fields filled', () => {
    expect(validateRegisterAddress(validAddress)).toEqual({})
  })

  it('flags every blank sub-field', () => {
    const empty: RegisterAddress = {
      houseNo: '', moo: '', soi: '', road: '', tambon: '', amphoe: '', province: '', postalCode: '',
    }
    const e = validateRegisterAddress(empty)
    expect(Object.keys(e)).toHaveLength(8)
  })

  it('rejects a postal code that is not 5 digits', () => {
    const e = validateRegisterAddress({ ...validAddress, postalCode: '101' })
    expect(e.postalCode).toBeTruthy()
  })
})

describe('validateRegisterAddressStep + addressStepHasErrors', () => {
  it('validates both addresses independently when sameAsCurrentAddress is false', () => {
    const blank: RegisterAddress = { houseNo: '', moo: '', soi: '', road: '', tambon: '', amphoe: '', province: '', postalCode: '' }
    const result = validateRegisterAddressStep(validAddress, blank, false)
    expect(result.current).toEqual({})
    expect(Object.keys(result.registered)).toHaveLength(8)
    expect(addressStepHasErrors(result)).toBe(true)
  })

  it('skips validating the registered address entirely when sameAsCurrentAddress is true', () => {
    const blank: RegisterAddress = { houseNo: '', moo: '', soi: '', road: '', tambon: '', amphoe: '', province: '', postalCode: '' }
    const result = validateRegisterAddressStep(validAddress, blank, true)
    expect(result.registered).toEqual({})
    expect(addressStepHasErrors(result)).toBe(false)
  })
})

describe('copyAddressIfSame', () => {
  const registered: RegisterAddress = { ...validAddress, houseNo: '999' }

  it('copies current into registered when the flag is set', () => {
    expect(copyAddressIfSame(validAddress, registered, true)).toEqual(validAddress)
  })

  it('leaves registered untouched when the flag is not set', () => {
    expect(copyAddressIfSame(validAddress, registered, false)).toEqual(registered)
  })
})

const validContact: RegisterEmergencyContact = {
  name: 'สมหญิง ใจดี', relationship: 'มารดา', phone: '0898765432', altPhone: '',
}

describe('validateRegisterEmergencyContacts + emergencyContactsStepHasErrors', () => {
  it('requires at least 1 contact', () => {
    const errors = validateRegisterEmergencyContacts([])
    expect(errors).toHaveLength(1)
    expect(emergencyContactsStepHasErrors(errors)).toBe(true)
  })

  it('passes with 1 fully-filled contact (altPhone stays optional)', () => {
    const errors = validateRegisterEmergencyContacts([validContact])
    expect(emergencyContactsStepHasErrors(errors)).toBe(false)
  })

  it('flags a specific incomplete contact by index without affecting the others', () => {
    const errors = validateRegisterEmergencyContacts([
      validContact,
      { name: '', relationship: '', phone: '', altPhone: '' },
    ])
    expect(errors[0]).toEqual({})
    expect(Object.keys(errors[1]).sort()).toEqual(['name', 'phone', 'relationship'])
  })

  it('allows up to MAX_REGISTER_EMERGENCY_CONTACTS contacts', () => {
    const contacts = Array.from({ length: MAX_REGISTER_EMERGENCY_CONTACTS }, () => validContact)
    const errors = validateRegisterEmergencyContacts(contacts)
    expect(emergencyContactsStepHasErrors(errors)).toBe(false)
  })
})

describe('validateRegisterEmployeeStep', () => {
  it('only requires role — baseSalary/startDate are not fields here anymore', () => {
    expect(validateRegisterEmployeeStep({ role: 'EMPLOYEE' })).toEqual({})
    expect(validateRegisterEmployeeStep({ role: '' })).toEqual({ role: 'กรุณาเลือกตำแหน่ง' })
  })
})

describe('validateRegisterPasswordStep', () => {
  it('passes with a matching 8+ char password', () => {
    expect(validateRegisterPasswordStep({ password: 'password123', confirmPassword: 'password123' })).toEqual({})
  })

  it('rejects a password shorter than 8 characters', () => {
    const e = validateRegisterPasswordStep({ password: 'short', confirmPassword: 'short' })
    expect(e.password).toBeTruthy()
  })

  it('rejects mismatched passwords', () => {
    const e = validateRegisterPasswordStep({ password: 'password123', confirmPassword: 'different123' })
    expect(e.confirmPassword).toBeTruthy()
  })
})
