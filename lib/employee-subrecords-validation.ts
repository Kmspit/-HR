import { isValidThaiPhoneInput } from '@/lib/profile-validators-client'
import { DEPENDENT_RELATION_TYPES, type DependentRelationType } from '@/lib/register-form-validation'

/**
 * Pure per-row validation for the "ผู้ติดต่อ & บัญชีธนาคาร" tab (Phase 1
 * step 8b) — EmergencyContact/Dependent/BankAccount. Deliberately single-row,
 * not array-indexed like lib/register-form-validation.ts's
 * validateRegisterEmergencyContacts/validateRegisterDependents/
 * validateRegisterBankAccounts: those validate a whole wizard step submitted
 * at once, while this tab adds/edits rows one at a time via its own
 * add/edit form, so array-index-aligned errors would be the wrong shape
 * here. Same underlying rules and messages as the register wizard, kept in
 * sync by hand since the two forms serve different flows (new applicant vs.
 * HR editing an existing employee's records) that could reasonably diverge
 * later.
 */

export type EmergencyContactForm = {
  name: string
  relationship: string
  phone: string
  altPhone: string
  address: string
  isPrimary: boolean
}

export type EmergencyContactErrors = Partial<Record<'name' | 'relationship' | 'phone', string>>

export function validateEmergencyContactRow(form: EmergencyContactForm): EmergencyContactErrors {
  const e: EmergencyContactErrors = {}
  if (!form.name.trim()) e.name = 'กรุณากรอกชื่อ'
  if (!form.relationship.trim()) e.relationship = 'กรุณากรอกความสัมพันธ์'
  if (!form.phone.trim()) e.phone = 'กรุณากรอกเบอร์โทร'
  else if (!isValidThaiPhoneInput(form.phone)) e.phone = 'เบอร์ 10 หลัก เช่น 0812345678'
  return e
}

export function emergencyContactRowHasErrors(e: EmergencyContactErrors): boolean {
  return Object.keys(e).length > 0
}

export type DependentForm = {
  name: string
  relationType: DependentRelationType | ''
  birthDate: string
  nationalId: string
  isTaxAllowance: boolean
  note: string
}

export type DependentErrors = Partial<Record<'name' | 'relationType', string>>

/** nationalId is deliberately never format-validated — same reasoning as
 *  the Dependent model's own schema comment: a foreign dependent may not
 *  have a 13-digit Thai ID at all. */
export function validateDependentRow(form: DependentForm): DependentErrors {
  const e: DependentErrors = {}
  if (!form.name.trim()) e.name = 'กรุณากรอกชื่อ'
  if (!form.relationType || !(DEPENDENT_RELATION_TYPES as readonly string[]).includes(form.relationType)) {
    e.relationType = 'กรุณาเลือกความสัมพันธ์'
  }
  return e
}

export function dependentRowHasErrors(e: DependentErrors): boolean {
  return Object.keys(e).length > 0
}

export type BankAccountForm = {
  bankCode: string
  accountNumber: string
  accountName: string
  accountType: string
  isPrimary: boolean
}

export type BankAccountErrors = Partial<Record<'bankCode' | 'accountNumber' | 'accountName', string>>

export function validateBankAccountRow(form: BankAccountForm): BankAccountErrors {
  const e: BankAccountErrors = {}
  if (!form.bankCode) e.bankCode = 'กรุณาเลือกธนาคาร'
  const digits = form.accountNumber.replace(/[\s-]/g, '')
  if (!digits) e.accountNumber = 'กรุณากรอกเลขบัญชี'
  else if (!/^\d{10,15}$/.test(digits)) e.accountNumber = 'เลขบัญชีไม่ถูกต้อง'
  if (!form.accountName.trim()) e.accountName = 'กรุณากรอกชื่อบัญชี'
  return e
}

export function bankAccountRowHasErrors(e: BankAccountErrors): boolean {
  return Object.keys(e).length > 0
}
