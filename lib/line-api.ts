import crypto from 'crypto'
import { getLineChannelAccessToken, getLineChannelSecret } from '@/lib/line-config'

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
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
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

export async function pushLineMessages(
  toUserId: string,
  messages: object[],
): Promise<LinePushResult> {
  const { resolveLineChannelAccessToken } = await import('@/lib/line-credentials')
  const { token } = await resolveLineChannelAccessToken()
  if (!token) {
    console.log('[LINE push mock] to', toUserId, messages.length, 'messages')
    return { ok: true }
  }
  try {
    const res = await fetch(`${LINE_API}/message/push`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: toUserId, messages: messages.slice(0, 5) }),
    })
    if (!res.ok) {
      const text = await res.text()
      console.error('[LINE push]', res.status, text)
      return { ok: false, error: `LINE API ${res.status}: ${text.slice(0, 200)}` }
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

export async function getLineUserProfile(lineUserId: string): Promise<{
  displayName: string
  pictureUrl?: string
} | null> {
  const { resolveLineChannelAccessToken } = await import('@/lib/line-credentials')
  const { token } = await resolveLineChannelAccessToken()
  if (!token) return { displayName: 'LINE User' }
  try {
    const res = await fetch(`${LINE_API}/profile/${lineUserId}`, {
      headers: { Authorization: `Bearer ${token}` },
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
