import { buildDisplayName, normalizeThaiPhone } from '@/lib/profile-name'

/** ฟิลด์ที่ user แก้เองไม่ได้ (role, สิทธิ์, ข้อมูล HR) */
export const SELF_PROFILE_FORBIDDEN = new Set([
  'role',
  'status',
  'employeeId',
  'baseSalary',
  'department',
  'position',
  'branchId',
  'divisionId',
  'departmentId',
  'sectionId',
  'socialSecurity',
  'isCoworker',
  'startDate',
  'lineUserId',
  'lineDisplayName',
  'password',
  'passwordHash',
  'approvedById',
  'approvedAt',
])

export function normalizeEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase()
  if (!e) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null
  if (e.length > 254) return null
  return e
}

export function normalizeNationalId(raw: string | null | undefined): string | null {
  if (raw == null || String(raw).trim() === '') return null
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length !== 13) return null
  return digits
}

/**
 * Fields where clearing must be a deliberate, separate action — never a side effect of
 * saving unrelated form fields. nationalId appears on official/statutory documents and
 * dependent-relationship records, startDate feeds tenure/probation calculations, and
 * employeeId appears on official documents — a blank value silently wiping any of these
 * is a data-loss bug, not a valid "clear the field" request.
 */
export const PROTECTED_CLEAR_FIELDS: ReadonlySet<string> = new Set([
  'nationalId',
  'startDate',
  'employeeId',
])

/**
 * True when `key` is a protected field and `raw` is blank (absent/null/whitespace-only).
 * Callers should skip writing the field entirely in this case — leave the existing DB
 * value untouched — rather than normalize the blank value to null and write that.
 */
export function isBlankProtectedField(key: string, raw: unknown): boolean {
  if (!PROTECTED_CLEAR_FIELDS.has(key)) return false
  return raw == null || String(raw).trim() === ''
}

export function parseBirthDate(raw: string | null | undefined): Date | null | 'invalid' {
  if (raw == null || String(raw).trim() === '') return null
  const d = new Date(String(raw).trim())
  if (Number.isNaN(d.getTime())) return 'invalid'
  if (d > new Date()) return 'invalid'
  return d
}

export const MIN_EMPLOYEE_AGE = 15
export const MAX_EMPLOYEE_AGE = 80

/** Sanity range for an employee's age (not a legal minimum-working-age
 *  check) — catches "today's date typed as birthday" and similar mistakes,
 *  which parseBirthDate()'s not-in-the-future check alone can't (a real
 *  incident, backlog 4.9). Callers apply this only to a birthDate that
 *  actually changed — same "don't retroactively invalidate stored data"
 *  rule as isValidThaiNationalIdChecksum. */
export function isReasonableBirthDate(date: Date, now: Date = new Date()): boolean {
  const ageYears = (now.getTime() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  return ageYears >= MIN_EMPLOYEE_AGE && ageYears <= MAX_EMPLOYEE_AGE
}

export type SelfProfileInput = {
  prefix?: string
  firstName?: string
  lastName?: string
  nickname?: string | null
  phone?: string
  email?: string
  lineId?: string
  birthDate?: string | null
  nationalId?: string | null
}

export type ParsedSelfProfile =
  | {
      ok: true
      data: {
        name: string
        prefix: string
        nickname: string | null
        phone: string
        email: string
        birthDate: Date | null
        /** Present only when there's a valid value to write — see isBlankProtectedField. */
        nationalId?: string
      }
    }
  | { ok: false; error: string }

export function parseSelfProfileInput(input: SelfProfileInput): ParsedSelfProfile {
  const prefix = (input.prefix ?? 'นาย').trim() || 'นาย'
  const firstName = (input.firstName ?? '').trim()
  const lastName = (input.lastName ?? '').trim()
  if (!firstName) return { ok: false, error: 'กรุณากรอกชื่อ' }

  const phone = normalizeThaiPhone(input.phone ?? '')
  if (!phone) {
    return {
      ok: false,
      error: 'เบอร์โทรต้องเป็นตัวเลข 10 หลัก ขึ้นต้นด้วย 0 (เช่น 0812345678)',
    }
  }

  const email = normalizeEmail(input.email ?? '')
  if (!email) return { ok: false, error: 'รูปแบบอีเมลไม่ถูกต้อง' }

  const birthParsed = parseBirthDate(input.birthDate)
  if (birthParsed === 'invalid') return { ok: false, error: 'วันเกิดไม่ถูกต้อง' }

  const nationalIdBlank = isBlankProtectedField('nationalId', input.nationalId)
  const nationalId = nationalIdBlank ? null : normalizeNationalId(input.nationalId)
  if (!nationalIdBlank && !nationalId) {
    return { ok: false, error: 'เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก' }
  }

  return {
    ok: true,
    data: {
      name: buildDisplayName(prefix, firstName, lastName),
      prefix,
      nickname: input.nickname?.trim() || null,
      phone,
      email,
      birthDate: birthParsed,
      // blank input → key omitted entirely, so the update never touches the column
      ...(nationalId ? { nationalId } : {}),
    },
  }
}
