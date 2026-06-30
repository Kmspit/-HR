import { ENGLISH_ONLY_ERROR, isEnglishOnly } from '@/lib/english-input'

export type ChangePasswordInput = {
  currentPassword?: string
  newPassword?: string
  confirmPassword?: string
}

export function validateChangePasswordStrength(password: string): string | null {
  if (password.length < 8) return 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'
  if (!/[a-zA-Z]/.test(password)) return 'รหัสผ่านต้องมีตัวอักษรอย่างน้อย 1 ตัว'
  if (!/[0-9]/.test(password)) return 'รหัสผ่านต้องมีตัวเลขอย่างน้อย 1 ตัว'
  return null
}

export function validateChangePasswordInput(
  input: ChangePasswordInput,
): { ok: true; data: { currentPassword: string; newPassword: string; confirmPassword: string } } | { ok: false; error: string; field?: string } {
  const currentPassword = input.currentPassword?.trim() ?? ''
  const newPassword = input.newPassword ?? ''
  const confirmPassword = input.confirmPassword ?? ''

  if (!currentPassword) {
    return { ok: false, error: 'กรุณากรอกรหัสผ่านปัจจุบัน', field: 'currentPassword' }
  }
  if (!newPassword) {
    return { ok: false, error: 'กรุณากรอกรหัสผ่านใหม่', field: 'newPassword' }
  }
  if (!confirmPassword) {
    return { ok: false, error: 'กรุณายืนยันรหัสผ่านใหม่', field: 'confirmPassword' }
  }

  if (!isEnglishOnly(currentPassword)) {
    return { ok: false, error: ENGLISH_ONLY_ERROR, field: 'currentPassword' }
  }
  if (!isEnglishOnly(newPassword)) {
    return { ok: false, error: ENGLISH_ONLY_ERROR, field: 'newPassword' }
  }
  if (!isEnglishOnly(confirmPassword)) {
    return { ok: false, error: ENGLISH_ONLY_ERROR, field: 'confirmPassword' }
  }

  if (newPassword !== confirmPassword) {
    return { ok: false, error: 'รหัสผ่านใหม่ไม่ตรงกัน', field: 'confirmPassword' }
  }

  const strengthError = validateChangePasswordStrength(newPassword)
  if (strengthError) {
    return { ok: false, error: strengthError, field: 'newPassword' }
  }

  if (currentPassword === newPassword) {
    return { ok: false, error: 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านปัจจุบัน', field: 'newPassword' }
  }

  return { ok: true, data: { currentPassword, newPassword, confirmPassword } }
}
