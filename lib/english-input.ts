/** Email / password fields — ASCII letters, digits, and common credential symbols only. */

export const ENGLISH_ONLY_ERROR = 'กรุณากรอกเป็นภาษาอังกฤษเท่านั้น'

export const isEnglishOnly = (value: string) => /^[a-zA-Z0-9@._\-!#$%^&*]+$/.test(value)

export function englishOnlyFieldError(value: string): string | undefined {
  if (!value) return undefined
  return isEnglishOnly(value) ? undefined : ENGLISH_ONLY_ERROR
}

export function assertEnglishCredential(value: string, _fieldLabel = 'field'): string | null {
  if (!value) return null
  if (!isEnglishOnly(value)) return ENGLISH_ONLY_ERROR
  return null
}
