import { NextRequest, NextResponse } from 'next/server'
import { verifyLineWebhookSignature, type LineWebhookBody } from '@/lib/line-api'
import { handleLineWebhookEvent } from '@/lib/line-webhook-handlers'
import { getLineWebhookUrl } from '@/lib/line-config'
import { resolveLineChannelSecret, resolveLineChannelAccessToken } from '@/lib/line-credentials'

export const runtime = 'nodejs'

/** LINE Platform verification + ตรวจ env (GET) */
export async function GET() {
  const { secret, source: secretSource } = await resolveLineChannelSecret()
  const { token, source: tokenSource } = await resolveLineChannelAccessToken()
  const configured = !!secret && !!token

  return NextResponse.json({
    ok: true,
    webhook: true,
    configured,
    hasChannelSecret: !!secret,
    hasAccessToken: !!token,
    secretSource,
    tokenSource,
    webhookPath: '/api/line/webhook',
    webhookUrl: getLineWebhookUrl(),
    hint: configured
      ? 'พร้อม Verify ใน LINE Developers — ใช้ Channel secret ชุดเดียวกับที่ระบบอ่านได้'
      : 'ใส่ LINE_CHANNEL_SECRET + LINE_CHANNEL_ACCESS_TOKEN บน Vercel (โปรเจกต์ hrprogramkm) หรือบันทึกในหน้าตั้งค่า แล้ว Redeploy',
    verifyHelp: {
      url: getLineWebhookUrl(),
      common401:
        '401 = ลายเซ็นไม่ตรง — คัดลอก Channel secret ใหม่จาก LINE Developers → Basic settings → Channel secret',
    },
  })
}

/** LINE webhook events (POST) — ต้องตอบ 200 เมื่อลายเซ็นถูกต้อง */
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-line-signature')

  const { secret, source } = await resolveLineChannelSecret()
  if (!secret) {
    console.error('[line/webhook] missing channel secret (env + DB)')
    return NextResponse.json(
      {
        error: 'LINE not configured',
        hint: 'ตั้ง LINE_CHANNEL_SECRET บน Vercel หรือบันทึก Channel Secret ในหน้าตั้งค่าบริษัท',
      },
      { status: 503 },
    )
  }

  if (!verifyLineWebhookSignature(rawBody, signature, secret)) {
    console.error('[line/webhook] invalid signature', {
      secretSource: source,
      hasSignature: !!signature,
      bodyLength: rawBody.length,
    })
    return NextResponse.json(
      {
        error: 'Invalid signature',
        hint:
          'Channel secret ไม่ตรงกับ LINE Developers — ลบ/ใส่ใหม่ที่ Vercel (hrprogramkm) ให้ตรง Basic settings แล้ว Redeploy',
        secretSource: source,
      },
      { status: 401 },
    )
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
