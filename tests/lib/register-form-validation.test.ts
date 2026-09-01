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
  validateRegisterDependents,
  dependentsStepHasErrors,
  validateRegisterBankAccounts,
  bankAccountsStepHasErrors,
  MAX_REGISTER_EMERGENCY_CONTACTS,
  type RegisterAddress,
  type RegisterEmergencyContact,
  type RegisterDependent,
  type RegisterBankAccount,
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

  it('flags the 6 required sub-fields when blank', () => {
    const empty: RegisterAddress = {
      houseNo: '', moo: '', soi: '', road: '', tambon: '', amphoe: '', province: '', postalCode: '',
    }
    const e = validateRegisterAddress(empty)
    expect(Object.keys(e).sort()).toEqual(['amphoe', 'houseNo', 'postalCode', 'province', 'road', 'tambon'])
  })

  it('does not require moo or soi (condos/in-city addresses often have neither)', () => {
    const e = validateRegisterAddress({ ...validAddress, moo: '', soi: '' })
    expect(e.moo).toBeUndefined()
    expect(e.soi).toBeUndefined()
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
    expect(Object.keys(result.registered)).toHaveLength(6)
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

const validDependent: RegisterDependent = {
  name: 'เด็กชาย ใจดี', relationType: 'CHILD', birthDate: '2015-01-01', nationalId: '', isTaxAllowance: true,
}

describe('validateRegisterDependents + dependentsStepHasErrors', () => {
  it('is a no-op for an empty list — the whole step is optional', () => {
    const errors = validateRegisterDependents([])
    expect(errors).toEqual([])
    expect(dependentsStepHasErrors(errors)).toBe(false)
  })

  it('passes a fully-filled dependent (birthDate/nationalId stay optional)', () => {
    const errors = validateRegisterDependents([validDependent])
    expect(dependentsStepHasErrors(errors)).toBe(false)
  })

  it('never format-validates nationalId (foreign dependents may lack a 13-digit Thai ID)', () => {
    const errors = validateRegisterDependents([{ ...validDependent, nationalId: 'not-a-valid-id-at-all' }])
    expect(dependentsStepHasErrors(errors)).toBe(false)
  })

  it('requires name and relationType on any row that was added', () => {
    const errors = validateRegisterDependents([{ ...validDependent, name: '', relationType: '' }])
    expect(errors[0]).toEqual({ name: 'กรุณากรอกชื่อ', relationType: 'กรุณาเลือกความสัมพันธ์' })
    expect(dependentsStepHasErrors(errors)).toBe(true)
  })
})

const validBankAccount: RegisterBankAccount = {
  bankCode: '004', accountNumber: '1234567890', accountName: 'สมชาย ใจดี', accountType: 'ออมทรัพย์', isPrimary: true,
}

describe('validateRegisterBankAccounts + bankAccountsStepHasErrors', () => {
  it('is a no-op for an empty list — the whole step is optional', () => {
    const errors = validateRegisterBankAccounts([])
    expect(errors).toEqual([])
    expect(bankAccountsStepHasErrors(errors)).toBe(false)
  })

  it('passes a fully-filled bank account', () => {
    const errors = validateRegisterBankAccounts([validBankAccount])
    expect(bankAccountsStepHasErrors(errors)).toBe(false)
  })

  it('rejects an account number that is too short', () => {
    const errors = validateRegisterBankAccounts([{ ...validBankAccount, accountNumber: '123' }])
    expect(errors[0].accountNumber).toBeTruthy()
  })

  it('requires bankCode/accountNumber/accountName on any row that was added', () => {
    const errors = validateRegisterBankAccounts([{ bankCode: '', accountNumber: '', accountName: '', accountType: '', isPrimary: false }])
    expect(errors[0]).toEqual({
      bankCode: 'กรุณาเลือกธนาคาร',
      accountNumber: 'กรุณากรอกเลขบัญชี',
      accountName: 'กรุณากรอกชื่อบัญชี',
    })
    expect(bankAccountsStepHasErrors(errors)).toBe(true)
  })
})
