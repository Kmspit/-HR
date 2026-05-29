/**
 * Centralized debug logging for access/permission failures.
 * ช่วยดีบักว่าทำไมคำขอถูกปฏิเสธ (role / session / device / face / route)
 * โดยไม่กระทบ logic การ auth เดิม — เป็นแค่ console log ฝั่งเซิร์ฟเวอร์
 */
export type AccessDenyReason =
  | 'missing_session'
  | 'invalid_token'
  | 'inactive_account'
  | 'role_denied'
  | 'unauthorized_route'
  | 'device_denied'
  | 'face_denied'

export function logAccessDenied(reason: AccessDenyReason, details: Record<string, unknown> = {}) {
  try {
    console.warn(`[access-denied] reason=${reason}`, JSON.stringify(details))
  } catch {
    console.warn(`[access-denied] reason=${reason}`, details)
  }
}
