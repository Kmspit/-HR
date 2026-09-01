import crypto from 'crypto'

export type MaskedNationalId = {
  status: 'MASKED' | 'MISSING' | 'INVALID'
  display: string
}

/**
 * เลขบัตรประชาชนแบบ mask สำหรับแสดงผล เช่น x-xxxx-xxxxx-xx-3 (โชว์หลักสุดท้ายตัวเดียว)
 * โชว์แค่ 1 หลักท้าย ไม่ใช่ 3 — nationalIdPdfPassword() (lib/payslip-pdf-encrypt.ts) ใช้ 4
 * หลักท้ายเป็นรหัสเปิด PDF สลิปเงินเดือน โชว์ 3 หลักจะเหลือให้เดารหัสแค่หลักเดียว
 */
export function maskNationalId(nationalId: string | null | undefined): MaskedNationalId {
  const raw = String(nationalId ?? '').trim()
  if (!raw) return { status: 'MISSING', display: 'ยังไม่ได้กรอก' }

  const digits = raw.replace(/\D/g, '')
  if (digits.length !== 13) return { status: 'INVALID', display: 'ข้อมูลไม่ถูกต้อง' }

  return { status: 'MASKED', display: `x-xxxx-xxxxx-xx-${digits.slice(12)}` }
}

/**
 * Fingerprint for detecting "did this change" without persisting the value — two
 * different national IDs sharing a last digit produce the same maskNationalId() display,
 * so change-detection (e.g. profile edit history) needs something finer than the masked
 * string. Same technique as lineCredentialFingerprint() in lib/line-credentials.ts.
 */
export function nationalIdFingerprint(nationalId: string | null | undefined): string | null {
  const digits = String(nationalId ?? '').replace(/\D/g, '')
  if (!digits) return null
  return crypto.createHash('sha256').update(digits).digest('hex').slice(0, 12)
}

/**
 * Thai national ID check digit (หลักที่ 13) — กรมการปกครอง formula: multiply each of the
 * first 12 digits by (13 - index), sum them, then checkDigit = (11 - sum % 11) % 10. Must
 * equal the 13th digit for the number to be internally consistent.
 *
 * Deliberately separate from maskNationalId() and nationalIdFingerprint() — both of those
 * keep using format-only validation (13 digits) on purpose. Folding the checksum into
 * maskNationalId() would instantly flip every already-stored ID with a bad check digit
 * (typo'd before this validation existed) to INVALID, which is a data-quality question,
 * not a display/change-detection one. Callers that want to *reject new or changed* input
 * use this function explicitly instead.
 */
export function isValidThaiNationalIdChecksum(raw: string | null | undefined): boolean {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (digits.length !== 13) return false

  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += Number(digits[i]) * (13 - i)
  }
  const checkDigit = (11 - (sum % 11)) % 10
  return checkDigit === Number(digits[12])
}
