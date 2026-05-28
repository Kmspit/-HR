import crypto from 'crypto'
import { getLineChannelAccessToken, getLineChannelSecret } from '@/lib/line-config'

const LINE_API = 'https://api.line.me/v2/bot'

export function verifyLineWebhookSignature(body: string, signature: string | null): boolean {
  const secret = getLineChannelSecret()
  if (!secret) return false
  if (!signature) return false
  const hash = crypto.createHmac('sha256', secret).update(body).digest('base64')
  return hash === signature
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
  const token = getLineChannelAccessToken()
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

export async function pushLineText(toUserId: string, text: string): Promise<boolean> {
  const token = getLineChannelAccessToken()
  if (!token) {
    console.log('[LINE push mock] to', toUserId, '\n', text)
    return true
  }
  try {
    const res = await fetch(`${LINE_API}/message/push`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: toUserId,
        messages: [{ type: 'text', text: text.slice(0, 5000) }],
      }),
    })
    if (!res.ok) {
      console.error('[LINE push]', res.status, await res.text())
    }
    return res.ok
  } catch (err) {
    console.error('[LINE push]', err)
    return false
  }
}

export async function getLineUserProfile(lineUserId: string): Promise<{
  displayName: string
  pictureUrl?: string
} | null> {
  const token = getLineChannelAccessToken()
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
