import { isValidEmailInput } from '@/lib/profile-validators-client'
import { validateRegisterAddress, type RegisterAddress, type RegisterAddressErrors } from '@/lib/register-form-validation'

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
  currentAddress: RegisterAddress
  registeredAddress: RegisterAddress
  sameAsCurrentAddress: boolean
}

export type EmployeeProfileErrors = {
  personalEmail?: string
  currentAddress: RegisterAddressErrors
  registeredAddress: RegisterAddressErrors
}

export function isAddressBlank(address: RegisterAddress): boolean {
  return Object.values(address).every((v) => !v.trim())
}

/** nationality/maritalStatus are free-choice with no format constraint (the
 *  register wizard treats them the same way — see app/api/register/route.ts's
 *  z.string().optional()) — nothing to validate beyond leaving them alone. */
export function validateEmployeeProfile(form: EmployeeProfileForm): EmployeeProfileErrors {
  const errors: EmployeeProfileErrors = { currentAddress: {}, registeredAddress: {} }

  if (form.personalEmail.trim() && !isValidEmailInput(form.personalEmail)) {
    errors.personalEmail = 'รูปแบบอีเมลไม่ถูกต้อง'
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
export function coerceEmployeeProfileForm(body: unknown): EmployeeProfileForm {
  const o = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  return {
    nationality: typeof o.nationality === 'string' ? o.nationality : '',
    maritalStatus: typeof o.maritalStatus === 'string' ? o.maritalStatus : '',
    personalEmail: typeof o.personalEmail === 'string' ? o.personalEmail : '',
    currentAddress: coerceAddress(o.currentAddress),
    registeredAddress: coerceAddress(o.registeredAddress),
    sameAsCurrentAddress: o.sameAsCurrentAddress === true,
  }
}
