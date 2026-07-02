import { createLineApiHeaders, sanitizeLineAccessTokenForHeader } from '@/lib/line-http-headers'

const LINE_DATA_API = 'https://api-data.line.me/v2/bot'

export type LineUploadResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string }

/** อัปโหลดไฟล์ไป LINE Content API สำหรับส่ง type: file */
export async function uploadLineMessageContent(
  fileBuffer: Buffer,
  contentType: string,
  fileName: string,
): Promise<LineUploadResult> {
  const { resolveLineChannelAccessToken } = await import('@/lib/line-credentials')
  const resolved = await resolveLineChannelAccessToken()
  if (!resolved.token) {
    return { ok: false, error: 'ไม่มี LINE Channel access token' }
  }
  if (!resolved.tokenValid) {
    return {
      ok: false,
      error: resolved.validationError ?? 'LINE Access Token ไม่ถูกต้อง',
    }
  }

  const sanitized = sanitizeLineAccessTokenForHeader(resolved.token)
  if (!sanitized.ok) return { ok: false, error: sanitized.error }

  const safeName = fileName.replace(/[^\w.\-()]/g, '_').slice(0, 120) || 'document.pdf'

  try {
    const headers = new Headers()
    headers.set('Authorization', `Bearer ${sanitized.token}`)
    headers.set('Content-Type', contentType)
    headers.set('Content-Disposition', `attachment; filename="${safeName}"`)

    const res = await fetch(`${LINE_DATA_API}/message/upload`, {
      method: 'POST',
      headers,
      body: new Uint8Array(fileBuffer),
    })

    if (!res.ok) {
      const text = await res.text()
      return { ok: false, error: `LINE upload ${res.status}: ${text.slice(0, 200)}` }
    }

    const data = (await res.json()) as { messageId?: string }
    if (!data.messageId) {
      return { ok: false, error: 'LINE upload ไม่คืน messageId' }
    }
    return { ok: true, messageId: data.messageId }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'LINE upload failed',
    }
  }
}
