import { NextRequest, NextResponse } from 'next/server'
import { verifyLineWebhookSignature, type LineWebhookBody } from '@/lib/line-api'
import { handleLineWebhookEvent } from '@/lib/line-webhook-handlers'
import { getLineChannelSecret, getLineConfigStatus } from '@/lib/line-config'

export const runtime = 'nodejs'

/** LINE Platform verification + ตรวจ env (GET) */
export async function GET() {
  const status = getLineConfigStatus()
  return NextResponse.json({
    ok: true,
    configured: status.configured,
    webhook: true,
    ...status,
    hint: status.configured
      ? 'พร้อมใช้งาน — ตั้ง Webhook URL ใน LINE ตาม webhookUrl'
      : 'ใส่ env บน Vercel (Production) แล้ว Redeploy — ดู hasChannelSecret / hasAccessToken',
  })
}

/** LINE webhook events (POST) */
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-line-signature')

  const secret = getLineChannelSecret()
  if (!secret) {
    console.error('[line/webhook] missing LINE_CHANNEL_SECRET')
    return NextResponse.json({ error: 'LINE not configured' }, { status: 503 })
  }

  if (!verifyLineWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let body: LineWebhookBody
  try {
    body = JSON.parse(rawBody) as LineWebhookBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const events = body.events ?? []
  await Promise.all(events.map((ev) => handleLineWebhookEvent(ev)))

  return NextResponse.json({ ok: true })
}
