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

export function parseBirthDate(raw: string | null | undefined): Date | null | 'invalid' {
  if (raw == null || String(raw).trim() === '') return null
  const d = new Date(String(raw).trim())
  if (Number.isNaN(d.getTime())) return 'invalid'
  if (d > new Date()) return 'invalid'
  return d
}

export type SelfProfileInput = {
  prefix?: string
  firstName?: string
  lastName?: string
  nickname?: string | null
  phone?: string
  email?: string
  address?: string | null
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
        address: string | null
        birthDate: Date | null
        nationalId: string | null
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

  const nationalId = normalizeNationalId(input.nationalId)
  if (input.nationalId != null && String(input.nationalId).trim() !== '' && !nationalId) {
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
      address: input.address?.trim() || null,
      birthDate: birthParsed,
      nationalId,
    },
  }
}
