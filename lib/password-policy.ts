/**
 * Password policy validator — Phase 15
 * Rules: 8+ chars, uppercase, lowercase, digit, special character.
 */

export type PasswordPolicyResult = {
  valid: boolean
  errors: string[]
}

export function validatePassword(password: string): PasswordPolicyResult {
  const errors: string[] = []

  if (password.length < 8)              errors.push('ต้องมีอย่างน้อย 8 ตัวอักษร')
  if (!/[A-Z]/.test(password))          errors.push('ต้องมีตัวพิมพ์ใหญ่อย่างน้อย 1 ตัว')
  if (!/[a-z]/.test(password))          errors.push('ต้องมีตัวพิมพ์เล็กอย่างน้อย 1 ตัว')
  if (!/[0-9]/.test(password))          errors.push('ต้องมีตัวเลขอย่างน้อย 1 ตัว')
  if (!/[^A-Za-z0-9]/.test(password))   errors.push('ต้องมีอักขระพิเศษอย่างน้อย 1 ตัว เช่น !@#$%')

  return { valid: errors.length === 0, errors }
}
