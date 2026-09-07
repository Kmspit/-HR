import { isValidLineIdInput, lineIdHint } from '@/lib/line-id-client'
import { isValidThaiNationalIdChecksum } from '@/lib/national-id'
import { isReasonableBirthDate, MIN_EMPLOYEE_AGE, MAX_EMPLOYEE_AGE } from '@/lib/profile-update'

export function isValidEmailInput(raw: string): boolean {
  const e = raw.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254
}

export function isValidNationalIdInput(raw: string): boolean {
  const t = raw.trim()
  if (!t) return true
  return /^\d{13}$/.test(t.replace(/\D/g, ''))
}

export function isValidThaiPhoneInput(raw: string): boolean {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('66') && digits.length === 11) digits = `0${digits.slice(2)}`
  return /^0[0-9]{9}$/.test(digits)
}

export type ProfileFormErrors = Partial<
  Record<
    | 'firstName'
    | 'email'
    | 'phone'
    | 'lineId'
    | 'nationalId'
    | 'birthDate',
    string
  >
>

export function validateSelfProfileForm(
  form: {
    firstName: string
    email: string
    phone: string
    lineId: string
    nationalId?: string
    birthDate?: string
  },
  /** Original stored values, for change-detection — checksum/age-range
   *  checks only apply when the value actually changed, never re-validating
   *  stored data that predates these checks just because the form
   *  re-submitted it unchanged. Same rule as EmployeeEditClient.tsx. */
  original?: { nationalId?: string | null; birthDate?: string | null },
): ProfileFormErrors {
  const e: ProfileFormErrors = {}
  if (!form.firstName.trim()) e.firstName = 'กรุณากรอกชื่อ'
  if (!isValidEmailInput(form.email)) e.email = 'รูปแบบอีเมลไม่ถูกต้อง'
  if (!isValidThaiPhoneInput(form.phone)) e.phone = 'เบอร์ 10 หลัก ขึ้นต้นด้วย 0'
  if (!form.lineId.trim() || !isValidLineIdInput(form.lineId)) e.lineId = lineIdHint()
  if (form.nationalId != null && !isValidNationalIdInput(form.nationalId)) {
    e.nationalId = 'เลขบัตร 13 หลัก'
  } else if (
    form.nationalId?.trim() &&
    form.nationalId !== (original?.nationalId ?? '') &&
    !isValidThaiNationalIdChecksum(form.nationalId)
  ) {
    e.nationalId = 'เลขบัตรประชาชนไม่ถูกต้อง (เลขตรวจสอบไม่ตรง)'
  }
  if (form.birthDate?.trim()) {
    const d = new Date(form.birthDate)
    if (Number.isNaN(d.getTime()) || d > new Date()) {
      e.birthDate = 'วันเกิดไม่ถูกต้อง'
    } else if (
      form.birthDate !== (original?.birthDate ?? '') &&
      !isReasonableBirthDate(d)
    ) {
      e.birthDate = `อายุต้องอยู่ระหว่าง ${MIN_EMPLOYEE_AGE}-${MAX_EMPLOYEE_AGE} ปี`
    }
  }
  return e
}

export const profileInputClass =
  'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-green-500 transition'

export const profileInputErrorClass =
  'w-full bg-white/5 border border-red-500/50 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-red-500 transition'
