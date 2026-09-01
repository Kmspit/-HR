import { isValidEmailInput, isValidNationalIdInput, isValidThaiPhoneInput } from '@/lib/profile-validators-client'
import { isValidLineIdInput, lineIdHint } from '@/lib/line-id-client'
import { isValidThaiNationalIdChecksum } from '@/lib/national-id'

/**
 * Pure validation for the registration wizard, one function per step — kept
 * free of React so it's testable directly (this project has no React
 * Testing Library), same reasoning as lib/profile-validators-client.ts's
 * validateSelfProfileForm.
 */

export type RegisterPersonalInfo = {
  branchId: string
  firstName: string
  lastName: string
  email: string
  phone: string
  lineId: string
  nationalId: string
}

export type RegisterPersonalErrors = Partial<Record<keyof RegisterPersonalInfo, string>>

/** nationalId was optional pre-Phase-1; it's required now — format (13 digits)
 *  plus the real กรมการปกครอง check digit (lib/national-id.ts). This is a
 *  brand-new registration, not an edit of stored data, so there's no
 *  "don't invalidate existing values" concern here — every submission is new
 *  input and can be held to the full check. Contrast with the employee-edit
 *  page, which only checksum-validates a nationalId the editor actually
 *  changed (see EmployeeEditClient.tsx). */
export function validateRegisterPersonalStep(form: RegisterPersonalInfo): RegisterPersonalErrors {
  const e: RegisterPersonalErrors = {}
  if (!form.branchId) e.branchId = 'กรุณาเลือกสาขา'
  if (!form.firstName.trim()) e.firstName = 'กรุณากรอกชื่อจริง'
  if (!form.lastName.trim()) e.lastName = 'กรุณากรอกนามสกุล'
  if (!form.email.trim()) e.email = 'กรุณากรอกอีเมล'
  else if (!isValidEmailInput(form.email)) e.email = 'รูปแบบอีเมลไม่ถูกต้อง'
  if (!form.phone.trim()) e.phone = 'กรุณากรอกเบอร์โทร'
  else if (!isValidThaiPhoneInput(form.phone)) e.phone = 'เบอร์ 10 หลัก เช่น 0812345678'
  if (!form.lineId.trim()) e.lineId = 'กรุณากรอก LINE ID'
  else if (!isValidLineIdInput(form.lineId)) e.lineId = lineIdHint()
  if (!form.nationalId.trim()) e.nationalId = 'กรุณากรอกเลขบัตรประชาชน'
  else if (!isValidNationalIdInput(form.nationalId)) e.nationalId = 'เลขบัตรประชาชนต้อง 13 หลัก'
  else if (!isValidThaiNationalIdChecksum(form.nationalId)) e.nationalId = 'เลขบัตรประชาชนไม่ถูกต้อง (เลขตรวจสอบไม่ตรง)'
  return e
}

export type RegisterAddress = {
  houseNo: string
  moo: string
  soi: string
  road: string
  tambon: string
  amphoe: string
  province: string
  postalCode: string
}

export type RegisterAddressErrors = Partial<Record<keyof RegisterAddress, string>>

/** moo/soi are deliberately not required — condos and other in-city
 *  addresses commonly have neither, and forcing the field just gets a
 *  garbage "-" or "ไม่มี" typed in instead of real data. */
const REQUIRED_ADDRESS_MSG: Partial<Record<keyof RegisterAddress, string>> = {
  houseNo: 'กรุณากรอกบ้านเลขที่',
  road: 'กรุณากรอกถนน',
  tambon: 'กรุณากรอกตำบล/แขวง',
  amphoe: 'กรุณากรอกอำเภอ/เขต',
  province: 'กรุณากรอกจังหวัด',
  postalCode: 'กรุณากรอกรหัสไปรษณีย์',
}

export function validateRegisterAddress(address: RegisterAddress): RegisterAddressErrors {
  const e: RegisterAddressErrors = {}
  for (const key of Object.keys(REQUIRED_ADDRESS_MSG) as (keyof RegisterAddress)[]) {
    if (!address[key].trim()) e[key] = REQUIRED_ADDRESS_MSG[key]!
  }
  if (address.postalCode.trim() && !/^\d{5}$/.test(address.postalCode.trim())) {
    e.postalCode = 'รหัสไปรษณีย์ 5 หลัก'
  }
  return e
}

export type RegisterAddressStepErrors = {
  current: RegisterAddressErrors
  registered: RegisterAddressErrors
}

/** When sameAsCurrentAddress is checked, the registered-address fields are
 *  copied from current at save time (see copyAddressIfSame below) rather
 *  than left blank — so they never need their own validation pass. */
export function validateRegisterAddressStep(
  current: RegisterAddress,
  registered: RegisterAddress,
  sameAsCurrentAddress: boolean,
): RegisterAddressStepErrors {
  return {
    current: validateRegisterAddress(current),
    registered: sameAsCurrentAddress ? {} : validateRegisterAddress(registered),
  }
}

export function addressStepHasErrors(errors: RegisterAddressStepErrors): boolean {
  return Object.keys(errors.current).length > 0 || Object.keys(errors.registered).length > 0
}

export function copyAddressIfSame(
  current: RegisterAddress,
  registered: RegisterAddress,
  sameAsCurrentAddress: boolean,
): RegisterAddress {
  return sameAsCurrentAddress ? { ...current } : registered
}

export type RegisterEmergencyContact = {
  name: string
  relationship: string
  phone: string
  altPhone: string
}

export type RegisterEmergencyContactErrors = Partial<
  Record<'name' | 'relationship' | 'phone', string>
>

export const MAX_REGISTER_EMERGENCY_CONTACTS = 3

/** At least 1 contact required, up to MAX_REGISTER_EMERGENCY_CONTACTS — each
 *  filled-in contact needs name/relationship/phone; altPhone stays optional.
 *  Returns one error object per contact (index-aligned with the input array)
 *  so the UI can show inline errors on whichever row is incomplete. */
export function validateRegisterEmergencyContacts(
  contacts: RegisterEmergencyContact[],
): RegisterEmergencyContactErrors[] {
  if (contacts.length === 0) {
    return [{ name: 'กรุณาเพิ่มผู้ติดต่อฉุกเฉินอย่างน้อย 1 คน' }]
  }
  return contacts.map((c) => {
    const e: RegisterEmergencyContactErrors = {}
    if (!c.name.trim()) e.name = 'กรุณากรอกชื่อ'
    if (!c.relationship.trim()) e.relationship = 'กรุณากรอกความสัมพันธ์'
    if (!c.phone.trim()) e.phone = 'กรุณากรอกเบอร์โทร'
    else if (!isValidThaiPhoneInput(c.phone)) e.phone = 'เบอร์ 10 หลัก เช่น 0812345678'
    return e
  })
}

export function emergencyContactsStepHasErrors(errors: RegisterEmergencyContactErrors[]): boolean {
  return errors.some((e) => Object.keys(e).length > 0)
}

export const DEPENDENT_RELATION_TYPES = ['SPOUSE', 'CHILD', 'PARENT', 'OTHER'] as const
export type DependentRelationType = (typeof DEPENDENT_RELATION_TYPES)[number]

export type RegisterDependent = {
  name: string
  relationType: DependentRelationType | ''
  birthDate: string
  nationalId: string
  isTaxAllowance: boolean
}

export type RegisterDependentErrors = Partial<Record<'name' | 'relationType', string>>

/** The whole step is optional (0 dependents is fine) — but each row the
 *  applicant actually adds still needs a name and a relationType, since
 *  relationType drives tax-allowance eligibility calculations later.
 *  nationalId is deliberately never format-validated here (see the schema
 *  comment on Dependent — a foreign dependent may not have a 13-digit
 *  Thai ID at all). */
export function validateRegisterDependents(dependents: RegisterDependent[]): RegisterDependentErrors[] {
  return dependents.map((d) => {
    const e: RegisterDependentErrors = {}
    if (!d.name.trim()) e.name = 'กรุณากรอกชื่อ'
    if (!d.relationType) e.relationType = 'กรุณาเลือกความสัมพันธ์'
    return e
  })
}

export function dependentsStepHasErrors(errors: RegisterDependentErrors[]): boolean {
  return errors.some((e) => Object.keys(e).length > 0)
}

export type RegisterBankAccount = {
  bankCode: string
  accountNumber: string
  accountName: string
  accountType: string
  isPrimary: boolean
}

export type RegisterBankAccountErrors = Partial<Record<'bankCode' | 'accountNumber' | 'accountName', string>>

/** Also optional as a whole step — each added row needs bank/number/name.
 *  accountNumber format is loosely checked (10-15 digits after stripping
 *  spaces/dashes) since Thai account number lengths vary by bank. */
export function validateRegisterBankAccounts(accounts: RegisterBankAccount[]): RegisterBankAccountErrors[] {
  return accounts.map((a) => {
    const e: RegisterBankAccountErrors = {}
    if (!a.bankCode) e.bankCode = 'กรุณาเลือกธนาคาร'
    const digits = a.accountNumber.replace(/[\s-]/g, '')
    if (!digits) e.accountNumber = 'กรุณากรอกเลขบัญชี'
    else if (!/^\d{10,15}$/.test(digits)) e.accountNumber = 'เลขบัญชีไม่ถูกต้อง'
    if (!a.accountName.trim()) e.accountName = 'กรุณากรอกชื่อบัญชี'
    return e
  })
}

export function bankAccountsStepHasErrors(errors: RegisterBankAccountErrors[]): boolean {
  return errors.some((e) => Object.keys(e).length > 0)
}

export type RegisterEmployeeInfo = {
  role: string
}

export type RegisterEmployeeErrors = Partial<Record<keyof RegisterEmployeeInfo, string>>

/** baseSalary/startDate deliberately excluded — HR sets both at approval
 *  time now, applicants never see them (see EmployeeManager's future
 *  unified approve+org-assign modal, Phase 1 step 7). */
export function validateRegisterEmployeeStep(form: RegisterEmployeeInfo): RegisterEmployeeErrors {
  const e: RegisterEmployeeErrors = {}
  if (!form.role) e.role = 'กรุณาเลือกตำแหน่ง'
  return e
}

export type RegisterPasswordInfo = {
  password: string
  confirmPassword: string
}

export type RegisterPasswordErrors = Partial<Record<keyof RegisterPasswordInfo, string>>

export function validateRegisterPasswordStep(form: RegisterPasswordInfo): RegisterPasswordErrors {
  const e: RegisterPasswordErrors = {}
  if (!form.password) e.password = 'กรุณากรอกรหัสผ่าน'
  else if (form.password.length < 8) e.password = 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'
  if (form.password !== form.confirmPassword) e.confirmPassword = 'รหัสผ่านไม่ตรงกัน'
  return e
}
