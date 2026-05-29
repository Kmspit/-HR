/**
 * LINE Messaging API ต้องการ HTTP header เป็น Latin-1 (ByteString)
 * ถ้า Access Token มีตัวอักษรไทย/อักขระพิเศษที่ copy ผิด → fetch จะ error
 */

export type LineTokenSanitizeResult =
  | { ok: true; token: string; strippedNonAscii: boolean }
  | { ok: false; error: string }

/** คงเฉพาะอักขระที่ใช้ใน Authorization header ได้ */
export function sanitizeLineAccessTokenForHeader(
  raw: string | undefined | null,
): LineTokenSanitizeResult {
  if (raw == null) {
    return { ok: false, error: 'ไม่มี LINE Channel access token' }
  }
  let t = String(raw).trim()
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    t = t.slice(1, -1).trim()
  }
  if (!t) {
    return { ok: false, error: 'ไม่มี LINE Channel access token' }
  }

  const strippedNonAscii = /[^\x20-\x7E]/.test(t)
  const token = t.replace(/[^\x20-\x7E]/g, '').trim()

  if (!token || token.length < 20) {
    return {
      ok: false,
      error: strippedNonAscii
        ? 'LINE access token มีตัวอักษรไทย/อักขระพิเศษปน — คัดลอกเฉพาะ Token จาก Messaging API'
        : 'LINE access token สั้นหรือว่างเกินไป',
    }
  }

  return { ok: true, token, strippedNonAscii }
}

export function createLineApiHeaders(accessToken: string): Headers {
  const sanitized = sanitizeLineAccessTokenForHeader(accessToken)
  if (!sanitized.ok) {
    throw new Error(sanitized.error)
  }
  if (sanitized.strippedNonAscii) {
    console.warn(
      '[LINE] access token had non-ASCII characters removed before API call',
    )
  }
  const headers = new Headers()
  headers.set('Content-Type', 'application/json; charset=utf-8')
  headers.set('Authorization', `Bearer ${sanitized.token}`)
  return headers
}
