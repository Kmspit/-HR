import { isValidEmailInput } from '@/lib/profile-validators-client'
import { validateRegisterAddress, type RegisterAddress, type RegisterAddressErrors } from '@/lib/register-form-validation'
import { isValidPaymentMethod } from '@/lib/payment-method'
import { isValidBloodType } from '@/lib/blood-type'
import { isValidEducationLevel } from '@/lib/education-level'

/**
 * Pure validation for the HR employee-edit "ข้อมูลส่วนตัวเพิ่มเติม" tab
 * (Phase 1 step 8a) — same RegisterAddress shape/required-field rule as the
 * registration wizard (moo/soi optional, per lib/register-form-validation.ts),
 * but NOT the same strictness: registration always requires a complete
 * address, while this is an edit surface an HR admin may open on a legacy
 * employee (pre-step-5/6) whose EmployeeProfile row doesn't exist yet, or an
 * employee who only ever gave partial data. Forcing full completion on every
 * save here would block an HR admin from fixing just the nationality field
 * today and the address next week. So each address block validates as
 * "blank is fine, but partial is not" — either every field is empty (nothing
 * to save, skip validation) or the same required subset as registration
 * applies (a tambon with no province is worse than no address at all).
 */

export type EmployeeProfileForm = {
  nationality: string
  maritalStatus: string
  personalEmail: string
  religion: string
  paymentMethod: string
  currentAddress: RegisterAddress
  registeredAddress: RegisterAddress
  sameAsCurrentAddress: boolean
  // HR-editable employee-fields batch (2026-09-22) — blood group,
  // parents/siblings summary, highest education, special skills, prior work
  // history as free text. siblingsTotal/siblingsOrder/educationGraduationYear
  // are 0 when unset (same "0 means not entered" convention as the payroll
  // allowance fields on EmployeeEditClient's NumericInput usage) — the PUT
  // route below converts 0 to null before writing.
  bloodType: string
  fatherName: string
  fatherOccupation: string
  motherName: string
  motherOccupation: string
  siblingsTotal: number
  siblingsOrder: number
  educationLevel: string
  educationInstitution: string
  educationMajor: string
  educationGraduationYear: number
  specialSkills: string
  workHistoryText: string
}

export type EmployeeProfileErrors = {
  personalEmail?: string
  paymentMethod?: string
  bloodType?: string
  educationLevel?: string
  currentAddress: RegisterAddressErrors
  registeredAddress: RegisterAddressErrors
}

export function isAddressBlank(address: RegisterAddress): boolean {
  return Object.values(address).every((v) => !v.trim())
}

/** nationality/maritalStatus/religion are free-choice with no format
 *  constraint (the register wizard treats them the same way — see
 *  app/api/register/route.ts's z.string().optional()) — nothing to validate
 *  beyond leaving them alone. paymentMethod is the one exception: it's a
 *  closed set (the PaymentMethod enum), so an unrecognized value (a stale
 *  client, a hand-crafted request) is rejected rather than silently stored. */
export function validateEmployeeProfile(form: EmployeeProfileForm): EmployeeProfileErrors {
  const errors: EmployeeProfileErrors = { currentAddress: {}, registeredAddress: {} }

  if (form.personalEmail.trim() && !isValidEmailInput(form.personalEmail)) {
    errors.personalEmail = 'รูปแบบอีเมลไม่ถูกต้อง'
  }

  if (form.paymentMethod.trim() && !isValidPaymentMethod(form.paymentMethod)) {
    errors.paymentMethod = 'วิธีจ่ายเงินไม่ถูกต้อง'
  }

  if (form.bloodType.trim() && !isValidBloodType(form.bloodType)) {
    errors.bloodType = 'กรุ๊ปเลือดไม่ถูกต้อง'
  }

  if (form.educationLevel.trim() && !isValidEducationLevel(form.educationLevel)) {
    errors.educationLevel = 'วุฒิการศึกษาไม่ถูกต้อง'
  }

  if (!isAddressBlank(form.currentAddress)) {
    errors.currentAddress = validateRegisterAddress(form.currentAddress)
  }

  if (!form.sameAsCurrentAddress && !isAddressBlank(form.registeredAddress)) {
    errors.registeredAddress = validateRegisterAddress(form.registeredAddress)
  }

  return errors
}

export function employeeProfileHasErrors(errors: EmployeeProfileErrors): boolean {
  return (
    Boolean(errors.personalEmail) ||
    Boolean(errors.paymentMethod) ||
    Boolean(errors.bloodType) ||
    Boolean(errors.educationLevel) ||
    Object.keys(errors.currentAddress).length > 0 ||
    Object.keys(errors.registeredAddress).length > 0
  )
}

/** For the PUT route's single-message 400 response — server-side validation
 *  here is defense-in-depth (the tab already validates and blocks before
 *  submit), so an exact field breakdown isn't needed, just a representative
 *  message. Same convention as app/api/register/route.ts's zodFirstError. */
export function firstEmployeeProfileError(errors: EmployeeProfileErrors): string {
  if (errors.personalEmail) return errors.personalEmail
  if (errors.paymentMethod) return errors.paymentMethod
  if (errors.bloodType) return errors.bloodType
  if (errors.educationLevel) return errors.educationLevel
  const first = Object.values(errors.currentAddress)[0] ?? Object.values(errors.registeredAddress)[0]
  return first ?? 'ข้อมูลไม่ถูกต้อง'
}

const EMPTY_ADDRESS: RegisterAddress = {
  houseNo: '', moo: '', soi: '', road: '', tambon: '', amphoe: '', province: '', postalCode: '',
}

function coerceAddress(v: unknown): RegisterAddress {
  if (typeof v !== 'object' || v === null) return { ...EMPTY_ADDRESS }
  const o = v as Record<string, unknown>
  const field = (k: keyof RegisterAddress) => (typeof o[k] === 'string' ? (o[k] as string) : '')
  return {
    houseNo: field('houseNo'), moo: field('moo'), soi: field('soi'), road: field('road'),
    tambon: field('tambon'), amphoe: field('amphoe'), province: field('province'), postalCode: field('postalCode'),
  }
}

/**
 * Narrows an untyped request body (JSON.parse output, or a client payload)
 * into EmployeeProfileForm — used by BOTH the tab component and the PUT
 * route, so client and server validate the exact same shape through the
 * exact same validateEmployeeProfile() rather than two hand-written checks
 * that could quietly drift apart across 20 fields.
 */
function coerceNumber(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

export function coerceEmployeeProfileForm(body: unknown): EmployeeProfileForm {
  const o = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  return {
    nationality: typeof o.nationality === 'string' ? o.nationality : '',
    maritalStatus: typeof o.maritalStatus === 'string' ? o.maritalStatus : '',
    personalEmail: typeof o.personalEmail === 'string' ? o.personalEmail : '',
    religion: typeof o.religion === 'string' ? o.religion : '',
    paymentMethod: typeof o.paymentMethod === 'string' ? o.paymentMethod : '',
    currentAddress: coerceAddress(o.currentAddress),
    registeredAddress: coerceAddress(o.registeredAddress),
    sameAsCurrentAddress: o.sameAsCurrentAddress === true,
    bloodType: typeof o.bloodType === 'string' ? o.bloodType : '',
    fatherName: typeof o.fatherName === 'string' ? o.fatherName : '',
    fatherOccupation: typeof o.fatherOccupation === 'string' ? o.fatherOccupation : '',
    motherName: typeof o.motherName === 'string' ? o.motherName : '',
    motherOccupation: typeof o.motherOccupation === 'string' ? o.motherOccupation : '',
    siblingsTotal: coerceNumber(o.siblingsTotal),
    siblingsOrder: coerceNumber(o.siblingsOrder),
    educationLevel: typeof o.educationLevel === 'string' ? o.educationLevel : '',
    educationInstitution: typeof o.educationInstitution === 'string' ? o.educationInstitution : '',
    educationMajor: typeof o.educationMajor === 'string' ? o.educationMajor : '',
    educationGraduationYear: coerceNumber(o.educationGraduationYear),
    specialSkills: typeof o.specialSkills === 'string' ? o.specialSkills : '',
    workHistoryText: typeof o.workHistoryText === 'string' ? o.workHistoryText : '',
  }
}
