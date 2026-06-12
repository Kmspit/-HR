import crypto from 'crypto'
import { getLineChannelAccessToken, getLineChannelSecret } from '@/lib/line-config'
import { createLineApiHeaders, sanitizeLineAccessTokenForHeader } from '@/lib/line-http-headers'

const LINE_API = 'https://api.line.me/v2/bot'

export function verifyLineWebhookSignature(
  body: string,
  signature: string | null,
  channelSecret?: string,
): boolean {
  const secret = channelSecret ?? getLineChannelSecret()
  if (!secret) return false
  if (!signature?.trim()) return false
  const hash = crypto.createHmac('sha256', secret).update(body).digest('base64')
  try {
    const a = Buffer.from(hash)
    const b = Buffer.from(signature)
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export type LineWebhookEvent = {
  type: string
  replyToken?: string
  source?: { type?: string; userId?: string }
  message?: { type?: string; text?: string }
}

export type LineWebhookBody = {
  destination?: string
  events?: LineWebhookEvent[]
}

export async function replyLineText(replyToken: string, text: string): Promise<boolean> {
  const { resolveLineChannelAccessToken } = await import('@/lib/line-credentials')
  const { token } = await resolveLineChannelAccessToken()
  if (!token) {
    console.log('[LINE reply mock]', text)
    return true
  }
  try {
    const res = await fetch(`${LINE_API}/message/reply`, {
      method: 'POST',
      headers: createLineApiHeaders(token),
      body: JSON.stringify({
        replyToken,
        messages: [{ type: 'text', text: text.slice(0, 5000) }],
      }),
    })
    if (!res.ok) {
      console.error('[LINE reply]', res.status, await res.text())
    }
    return res.ok
  } catch (err) {
    console.error('[LINE reply]', err)
    return false
  }
}

export type LinePushResult = { ok: boolean; error?: string }

export type LineTokenValidation = {
  ok: boolean
  displayName?: string
  error?: string
}

/** ตรวจว่า access token ใช้กับ LINE API ได้ (GET /bot/info) */
export async function validateLineAccessToken(token: string): Promise<LineTokenValidation> {
  const sanitized = sanitizeLineAccessTokenForHeader(token)
  if (!sanitized.ok) {
    return { ok: false, error: sanitized.error }
  }
  try {
    const res = await fetch(`${LINE_API}/info`, {
      headers: createLineApiHeaders(sanitized.token),
    })
    if (res.ok) {
      const data = (await res.json()) as { displayName?: string; userId?: string }
      return {
        ok: true,
        displayName: data.displayName?.trim() || 'LINE Bot',
      }
    }
    const text = await res.text()
    return { ok: false, error: formatLineApiError(res.status, text) }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'ตรวจสอบ LINE token ไม่สำเร็จ',
    }
  }
}

export function formatLineApiError(status: number, body: string): string {
  if (status === 401) {
    return (
      'LINE Access Token ไม่ถูกต้องหรือหมดอายุ — ไป LINE Developers → Messaging API → Issue token ใหม่ → ' +
      'ใส่ Vercel (hrprogramkm) ชื่อ LINE_CHANNEL_ACCESS_TOKEN แล้ว Redeploy (ต้องเป็นชุดเดียวกับ Channel secret)'
    )
  }
  try {
    const j = JSON.parse(body) as { message?: string }
    if (j.message) return `LINE API ${status}: ${j.message}`
  } catch {
    /* ignore */
  }
  return `LINE API ${status}: ${body.slice(0, 120)}`
}

export async function pushLineMessages(
  toUserId: string,
  messages: object[],
): Promise<LinePushResult> {
  const { resolveLineChannelAccessToken } = await import('@/lib/line-credentials')
  const resolved = await resolveLineChannelAccessToken()
  if (!resolved.token) {
    return { ok: false, error: 'ไม่มี LINE Channel access token — ตั้งใน Vercel หรือหน้าตั้งค่า' }
  }
  if (!resolved.tokenValid) {
    return {
      ok: false,
      error:
        resolved.validationError ??
        'LINE Access Token ไม่ถูกต้อง — Issue ใหม่ใน Messaging API แล้วใส่ Vercel',
    }
  }

  try {
    const res = await fetch(`${LINE_API}/message/push`, {
      method: 'POST',
      headers: createLineApiHeaders(resolved.token),
      body: JSON.stringify({ to: toUserId, messages: messages.slice(0, 5) }),
    })
    if (!res.ok) {
      const text = await res.text()
      console.error('[LINE push]', res.status, text)
      return { ok: false, error: formatLineApiError(res.status, text) }
    }
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'LINE push failed'
    console.error('[LINE push]', err)
    return { ok: false, error: msg }
  }
}

export async function pushLineText(toUserId: string, text: string): Promise<boolean> {
  const result = await pushLineMessages(toUserId, [{ type: 'text', text: text.slice(0, 5000) }])
  return result.ok
}

// ─── Reply helpers (Phase 14) ─────────────────────────────────────────────────

export async function replyLineMessages(replyToken: string, messages: object[]): Promise<boolean> {
  const { resolveLineChannelAccessToken } = await import('@/lib/line-credentials')
  const { token } = await resolveLineChannelAccessToken()
  if (!token) {
    console.log('[LINE reply-multi mock]', messages.length, 'messages')
    return true
  }
  try {
    const res = await fetch(`${LINE_API}/message/reply`, {
      method: 'POST',
      headers: createLineApiHeaders(token),
      body: JSON.stringify({ replyToken, messages: messages.slice(0, 5) }),
    })
    if (!res.ok) console.error('[LINE reply-multi]', res.status, await res.text())
    return res.ok
  } catch (err) {
    console.error('[LINE reply-multi]', err)
    return false
  }
}

export async function replyLineFlex(replyToken: string, altText: string, contents: object): Promise<boolean> {
  return replyLineMessages(replyToken, [{ type: 'flex', altText, contents }])
}

export async function getLineUserProfile(lineUserId: string): Promise<{
  displayName: string
  pictureUrl?: string
} | null> {
  const { resolveLineChannelAccessToken } = await import('@/lib/line-credentials')
  const { token } = await resolveLineChannelAccessToken()
  if (!token) return { displayName: 'LINE User' }
  try {
    const res = await fetch(`${LINE_API}/profile/${lineUserId}`, {
      headers: createLineApiHeaders(token),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { displayName?: string; pictureUrl?: string }
    return {
      displayName: data.displayName?.trim() || 'LINE User',
      pictureUrl: data.pictureUrl,
    }
  } catch {
    return null
  }
}
