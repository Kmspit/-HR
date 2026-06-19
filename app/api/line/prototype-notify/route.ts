import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { pushLineMessages } from '@/lib/line-api'
import { isLineOaConfiguredAsync } from '@/lib/line-config'
import { getHrLineRecipients } from '@/lib/attendance-line-recipients'
import { ensureDbSchema } from '@/lib/ensure-db-schema'

export const runtime = 'nodejs'

const CORS_ORIGINS = [
  'https://hrflow-app-gamma.vercel.app',
  'https://app-hr-km1.vercel.app',
  'https://hrprogramkm.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5500',
]

function corsHeaders(origin: string | null): HeadersInit {
  const allow =
    !origin ||
    CORS_ORIGINS.some((o) => origin === o) ||
    origin.endsWith('.vercel.app')
  return {
    'Access-Control-Allow-Origin': allow && origin ? origin : '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function json(data: unknown, status = 200, origin: string | null = null) {
  return NextResponse.json(data, { status, headers: corsHeaders(origin) })
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get('origin')),
  })
}

/** ส่งแจ้งเตือนลงเวลาไป LINE HR — ใช้จาก HTML prototype (หลีกเลี่ยง CORS ของ LINE API) */
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const session = await auth()
    if (!session?.user) {
      return json({ error: 'Unauthorized' }, 401, origin)
    }

    await ensureDbSchema().catch(() => {})

    if (!(await isLineOaConfiguredAsync())) {
      return json({ ok: false, reason: 'line_not_configured' }, 503, origin)
    }

    const body = (await req.json()) as { message?: string; imageUrl?: string | null }
    const message = body.message?.trim()
    if (!message) {
      return json({ ok: false, error: 'message required' }, 400, origin)
    }

    const messages: Array<{ type: string; text?: string; originalContentUrl?: string; previewImageUrl?: string }> = [
      { type: 'text', text: message.slice(0, 5000) },
    ]
    const imageUrl = body.imageUrl?.trim()
    if (imageUrl && /^https:\/\//i.test(imageUrl)) {
      messages.push({
        type: 'image',
        originalContentUrl: imageUrl,
        previewImageUrl: imageUrl,
      })
    }

    // 1. Push to linked HR users (ATTENDANCE_LINE_NOTIFY_TARGETS env หรือ user ที่ link แล้ว)
    const hrUsers = await getHrLineRecipients()
    if (hrUsers.length > 0) {
      let sent = 0, failed = 0
      for (const hr of hrUsers) {
        const result = await pushLineMessages(hr.lineUserId, messages)
        if (result.ok) sent += 1
        else failed += 1
      }
      return json({ ok: sent > 0, sent, failed }, 200, origin)
    }

    // 2. Fallback: broadcast to all OA followers
    const { resolveLineChannelAccessToken } = await import('@/lib/line-credentials')
    const resolved = await resolveLineChannelAccessToken()
    if (!resolved.token) {
      return json({ ok: false, reason: 'no_token', sent: 0, failed: 1 }, 200, origin)
    }
    const res = await fetch('https://api.line.me/v2/bot/message/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + resolved.token },
      body: JSON.stringify({ messages }),
    })
    if (res.ok) return json({ ok: true, sent: 1, via: 'broadcast' }, 200, origin)
    const errText = await res.text().catch(() => String(res.status))
    return json({ ok: false, reason: 'broadcast_failed', detail: errText }, 200, origin)
  } catch (err) {
    console.error('[line/prototype-notify]', err)
    return json({ ok: false, reason: 'server_error' }, 500, origin)
  }
}
