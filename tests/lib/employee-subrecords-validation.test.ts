import { describe, it, expect } from 'vitest'
import {
  validateEmergencyContactRow,
  emergencyContactRowHasErrors,
  validateDependentRow,
  dependentRowHasErrors,
  validateBankAccountRow,
  bankAccountRowHasErrors,
  type EmergencyContactForm,
  type DependentForm,
  type BankAccountForm,
} from '@/lib/employee-subrecords-validation'

function contactForm(overrides: Partial<EmergencyContactForm> = {}): EmergencyContactForm {
  return { name: 'สมชาย', relationship: 'พี่ชาย', phone: '0812345678', altPhone: '', address: '', isPrimary: false, ...overrides }
}

describe('validateEmergencyContactRow', () => {
  it('passes a fully valid row', () => {
    expect(emergencyContactRowHasErrors(validateEmergencyContactRow(contactForm()))).toBe(false)
  })

  it('requires name/relationship/phone', () => {
    const e = validateEmergencyContactRow(contactForm({ name: '', relationship: '', phone: '' }))
    expect(e.name).toBeTruthy()
    expect(e.relationship).toBeTruthy()
    expect(e.phone).toBeTruthy()
  })

  it('rejects a malformed phone', () => {
    const e = validateEmergencyContactRow(contactForm({ phone: '123' }))
    expect(e.phone).toBeTruthy()
  })

  it('altPhone/address are optional', () => {
    const e = validateEmergencyContactRow(contactForm({ altPhone: '', address: '' }))
    expect(emergencyContactRowHasErrors(e)).toBe(false)
  })
})

function dependentForm(overrides: Partial<DependentForm> = {}): DependentForm {
  return { name: 'เด็กหญิง ก', relationType: 'CHILD', birthDate: '', nationalId: '', isTaxAllowance: false, note: '', ...overrides }
}

describe('validateDependentRow', () => {
  it('passes with just name + relationType', () => {
    expect(dependentRowHasErrors(validateDependentRow(dependentForm()))).toBe(false)
  })

  it('requires name', () => {
    expect(validateDependentRow(dependentForm({ name: '' })).name).toBeTruthy()
  })

  it('requires a valid relationType', () => {
    expect(validateDependentRow(dependentForm({ relationType: '' })).relationType).toBeTruthy()
  })

  it('never validates nationalId format — a foreign dependent may not have a Thai ID', () => {
    const e = validateDependentRow(dependentForm({ nationalId: 'not-a-valid-id-at-all' }))
    expect(dependentRowHasErrors(e)).toBe(false)
  })
})

function bankForm(overrides: Partial<BankAccountForm> = {}): BankAccountForm {
  return { bankCode: 'SCB', accountNumber: '1234567890', accountName: 'สมชาย ใจดี', accountType: '', isPrimary: false, ...overrides }
}

describe('validateBankAccountRow', () => {
  it('passes a fully valid row', () => {
    expect(bankAccountRowHasErrors(validateBankAccountRow(bankForm()))).toBe(false)
  })

  it('requires bankCode/accountNumber/accountName', () => {
    const e = validateBankAccountRow(bankForm({ bankCode: '', accountNumber: '', accountName: '' }))
    expect(e.bankCode).toBeTruthy()
    expect(e.accountNumber).toBeTruthy()
    expect(e.accountName).toBeTruthy()
  })

  it('rejects an account number outside 10-15 digits', () => {
    expect(validateBankAccountRow(bankForm({ accountNumber: '123' })).accountNumber).toBeTruthy()
    expect(validateBankAccountRow(bankForm({ accountNumber: '1'.repeat(16) })).accountNumber).toBeTruthy()
  })

  it('accepts an account number with spaces/dashes, stripping them before length-checking', () => {
    const e = validateBankAccountRow(bankForm({ accountNumber: '123-456-7890' }))
    expect(e.accountNumber).toBeUndefined()
  })
})
