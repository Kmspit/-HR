import { NextRequest, NextResponse } from 'next/server'
import { type LineWebhookBody } from '@/lib/line-api'
import { handleLineWebhookEvent } from '@/lib/line-webhook-handlers'
import { getLineWebhookUrl } from '@/lib/line-config'
import {
  getLineWebhookDiagnostics,
  listLineChannelSecretCandidates,
  verifyLineWebhookWithCandidates,
} from '@/lib/line-credentials'

export const runtime = 'nodejs'

/** LINE Platform verification + ตรวจ env (GET) */
export async function GET() {
  const diag = await getLineWebhookDiagnostics()

  return NextResponse.json({
    ok: true,
    webhook: true,
    configured: diag.configured,
    hasChannelSecret: diag.hasChannelSecret,
    hasAccessToken: diag.hasAccessToken,
    accessTokenValid: diag.accessTokenValid,
    accessTokenSourceDetail: diag.accessTokenSourceDetail,
    botDisplayName: diag.botDisplayName,
    accessTokenError: diag.accessTokenError,
    tokenSource: diag.tokenSource,
    secretCandidateCount: diag.secretCandidateCount,
    triedSecretSources: diag.triedSecretSources,
    envAndDbSecretDiffer: diag.envAndDbSecretDiffer,
    envSecretFingerprint: diag.envSecretFingerprint,
    dbSecretFingerprint: diag.dbSecretFingerprint,
    secretLength: diag.secretLength,
    secretLooksWrong: diag.secretLooksWrong,
    fix401IfDiffer: diag.fix401IfDiffer,
    warnings: diag.warnings,
    webhookPath: '/api/line/webhook',
    webhookUrl: getLineWebhookUrl(),
    hint: diag.accessTokenValid === false
      ? diag.accessTokenError ?? 'Access Token ไม่ถูกต้อง — Issue ใหม่ใน Messaging API'
      : diag.secretLooksWrong
        ? diag.fix401IfDiffer
        : diag.configured
          ? 'พร้อมใช้งาน — Webhook + ส่งข้อความ/ใบเตือนได้'
          : 'ใส่ LINE_CHANNEL_SECRET + LINE_CHANNEL_ACCESS_TOKEN บน Vercel (hrprogramkm)',
    verifyHelp: {
      url: getLineWebhookUrl(),
      common401:
        '401 = ค่า LINE_CHANNEL_SECRET ไม่ตรง Channel ใน LINE Console — ไม่ใช่ปัญหา configured',
      steps: [
        'LINE Console → Channel ที่ตั้ง Webhook → Basic settings → Issue Channel secret → Copy',
        'Vercel โปรเจกต์ hrprogramkm → LINE_CHANNEL_SECRET = วางใหม่ (ไม่ใส่ Access Token)',
        'Redeploy Production',
        'LINE → Webhook → Verify อีกครั้ง',
      ],
    },
  })
}

/** LINE webhook events (POST) — ต้องตอบ 200 เมื่อลายเซ็นถูกต้อง */
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-line-signature')

  const candidates = await listLineChannelSecretCandidates()
  if (candidates.length === 0) {
    return NextResponse.json(
      {
        error: 'LINE not configured',
        hint: 'ตั้ง LINE_CHANNEL_SECRET บน Vercel (hrprogramkm)',
      },
      { status: 503 },
    )
  }

  const verify = await verifyLineWebhookWithCandidates(rawBody, signature)
  if (!verify.ok) {
    const diag = await getLineWebhookDiagnostics()
    let destination: string | undefined
    try {
      destination = (JSON.parse(rawBody) as { destination?: string }).destination
    } catch {
      /* ignore */
    }

    console.error('[line/webhook] invalid signature', {
      triedSources: verify.triedSources,
      hasSignature: !!signature,
      bodyLength: rawBody.length,
      destination,
      secretLooksWrong: diag.secretLooksWrong,
    })

    return NextResponse.json(
      {
        error: 'Invalid signature',
        hint:
          diag.secretLooksWrong && diag.fix401IfDiffer
            ? diag.fix401IfDiffer
            : 'Issue Channel secret ใหม่ใน LINE (Channel เดียวกับ Webhook) → ใส่ Vercel hrprogramkm → Redeploy',
        triedSecretSources: verify.triedSources,
        secretLooksWrong: diag.secretLooksWrong,
        secretLength: diag.secretLength,
        lineDestination: destination,
        warnings: diag.warnings,
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
  try {
    await Promise.all(events.map((ev) => handleLineWebhookEvent(ev)))
  } catch (error) {
    console.error('[LINE webhook] event handler error:', error)
  }

  return NextResponse.json({ ok: true })
}
