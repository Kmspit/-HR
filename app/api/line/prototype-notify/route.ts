import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { pushLineMessages } from '@/lib/line-api'
import { isLineOaConfiguredAsync } from '@/lib/line-config'
import { getHrLineRecipients } from '@/lib/attendance-line-recipients'
import { requirePrototypeBridgeSecret } from '@/lib/prototype-bridge'
import { HR_ADMIN } from '@/lib/module-gates'
import type { Role } from '@prisma/client'

export const runtime = 'nodejs'

const CORS_ORIGINS = [
  'https://hrflow-app-gamma.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5500',
]

function corsHeaders(origin: string | null): HeadersInit {
  const allow = !!origin && CORS_ORIGINS.some((o) => origin === o)
  return {
    'Access-Control-Allow-Origin': allow ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...(allow ? { 'Access-Control-Allow-Credentials': 'true' } : {}),
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
  const bridgeErr = requirePrototypeBridgeSecret(req)
  if (bridgeErr) {
    const body = await bridgeErr.json().catch(() => ({ ok: false, error: 'Forbidden' }))
    return json(body, bridgeErr.status, origin)
  }
  try {
    const session = await auth()
    if (!session?.user) {
      return json({ error: 'Unauthorized' }, 401, origin)
    }
    if (!HR_ADMIN.includes(session.user.role as Role)) {
      return json({ error: 'Forbidden' }, 403, origin)
    }
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

    return json(
      {
        ok: false,
        reason: 'no_hr_recipients',
        error: 'ไม่พบผู้รับแจ้งเตือน HR ที่ผูก LINE — ตั้ง ATTENDANCE_LINE_NOTIFY_TARGETS หรือให้ HR ผูก LINE OA',
        sent: 0,
        failed: 0,
      },
      503,
      origin,
    )
  } catch (err) {
    console.error('[line/prototype-notify]', err)
    return json({ ok: false, reason: 'server_error' }, 500, origin)
  }
}
