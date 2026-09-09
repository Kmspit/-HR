import crypto from 'crypto'
import { encryptField, FIELD_SALTS } from '@/lib/field-crypto'

export type MaskedNationalId = {
  status: 'MASKED' | 'MISSING' | 'INVALID'
  display: string
}

/**
 * เลขบัตรประชาชนแบบ mask สำหรับแสดงผล เช่น x-xxxx-xxxx0-12-3 (โชว์ 4 หลักท้าย)
 *
 * เดิมโชว์แค่ 1 หลักท้าย เพราะ nationalIdPdfPassword() (lib/payslip-pdf-encrypt.ts)
 * เคยใช้ 4 หลักท้ายเป็นรหัสเปิด PDF สลิปเงินเดือน — โชว์ 4 หลักตอนนั้นเท่ากับเฉลยรหัสสลิป
 * เอง หลัง payslip-password-hmac (รหัสสลิปเปลี่ยนไปใช้ HMAC(secret, payrollId) แทน ไม่ผูก
 * กับเลขบัตรอีกต่อไป) ข้อจำกัดนี้หมดไป จึงโชว์ 4 หลักท้ายได้ตามที่ HR ขอ เพื่อให้ตรวจสอบ/
 * แยกแยะพนักงานที่เลขบัตรคล้ายกันได้ง่ายขึ้น โดยยังไม่เฉลยเลขบัตรเต็ม (9 หลักแรกยัง mask)
 */
export function maskNationalId(nationalId: string | null | undefined): MaskedNationalId {
  const raw = String(nationalId ?? '').trim()
  if (!raw) return { status: 'MISSING', display: 'ยังไม่ได้กรอก' }

  const digits = raw.replace(/\D/g, '')
  if (digits.length !== 13) return { status: 'INVALID', display: 'ข้อมูลไม่ถูกต้อง' }

  return {
    status: 'MASKED',
    display: `x-xxxx-xxxx${digits[9]}-${digits.slice(10, 12)}-${digits[12]}`,
  }
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

export type EncryptedNationalId = {
  nationalIdEncrypted: string
  nationalIdFp: string
}

/**
 * nationalId-encryption Phase 1 dual-write helper — computes the two new
 * columns (AES-256-GCM ciphertext + sha256 fingerprint) from an already
 * normalized, non-blank nationalId. Callers ALSO keep writing the existing
 * plaintext `nationalId` column during Phase 1 (see the backlog item) — this
 * only adds the two parallel columns, it never replaces the plaintext write.
 *
 * Every duplicate-nationalId check must switch from `where: { nationalId }`
 * to `where: { nationalIdFp: encryptedNationalIdFields(x).nationalIdFp }` —
 * once nationalIdEncrypted uses a random IV per call (true from Phase 1
 * onward), two equal plaintexts never produce equal ciphertext, so only the
 * deterministic fingerprint can still detect a collision.
 */
export function encryptedNationalIdFields(nationalId: string): EncryptedNationalId {
  return {
    nationalIdEncrypted: encryptField(nationalId, FIELD_SALTS.USER_NATIONAL_ID),
    // nationalId is always a normalized, non-blank 13-digit string here (every
    // caller validates before reaching this point) — nationalIdFingerprint()
    // only returns null for blank input, so this cast is safe.
    nationalIdFp: nationalIdFingerprint(nationalId) as string,
  }
}
