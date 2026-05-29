import { NextRequest, NextResponse } from 'next/server'
import { verifyLineWebhookSignature, type LineWebhookBody } from '@/lib/line-api'
import { handleLineWebhookEvent } from '@/lib/line-webhook-handlers'
import { getLineWebhookUrl } from '@/lib/line-config'
import {
  getLineWebhookDiagnostics,
  listLineChannelSecretCandidates,
  resolveLineChannelAccessToken,
  verifyLineWebhookWithCandidates,
} from '@/lib/line-credentials'

export const runtime = 'nodejs'

/** LINE Platform verification + ตรวจ env (GET) */
export async function GET() {
  const diag = await getLineWebhookDiagnostics()
  const { token, source: tokenSource } = await resolveLineChannelAccessToken()

  return NextResponse.json({
    ok: true,
    webhook: true,
    configured: diag.configured,
    hasChannelSecret: diag.hasChannelSecret,
    hasAccessToken: !!token,
    tokenSource,
    secretCandidateCount: diag.secretCandidateCount,
    triedSecretSources: diag.triedSecretSources,
    envAndDbSecretDiffer: diag.envAndDbSecretDiffer,
    envSecretFingerprint: diag.envSecretFingerprint,
    dbSecretFingerprint: diag.dbSecretFingerprint,
    fix401IfDiffer: diag.fix401IfDiffer,
    webhookPath: '/api/line/webhook',
    webhookUrl: getLineWebhookUrl(),
    hint: diag.configured
      ? diag.envAndDbSecretDiffer
        ? 'มี secret 2 ชุดไม่ตรง — ดู fix401IfDiffer'
        : 'พร้อม Verify — ถ้ายัง 401 ให้ Issue Channel secret ใหม่ใน LINE แล้วอัปเดต Vercel'
      : 'ใส่ LINE_CHANNEL_SECRET + LINE_CHANNEL_ACCESS_TOKEN บน Vercel (hrprogramkm) หรือบันทึกในหน้าตั้งค่า',
    verifyHelp: {
      url: getLineWebhookUrl(),
      common401:
        '401 = ลายเซ็นไม่ตรงกับ Channel ใน LINE Console — Reissue secret → ใส่ Vercel → Redeploy',
    },
  })
}

/** LINE webhook events (POST) — ต้องตอบ 200 เมื่อลายเซ็นถูกต้อง */
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-line-signature')

  const candidates = await listLineChannelSecretCandidates()
  if (candidates.length === 0) {
    console.error('[line/webhook] missing channel secret (env + DB)')
    return NextResponse.json(
      {
        error: 'LINE not configured',
        hint: 'ตั้ง LINE_CHANNEL_SECRET บน Vercel (hrprogramkm) หรือบันทึกในหน้าตั้งค่าบริษัท',
      },
      { status: 503 },
    )
  }

  const verify = await verifyLineWebhookWithCandidates(rawBody, signature)
  if (!verify.ok) {
    const diag = await getLineWebhookDiagnostics()
    console.error('[line/webhook] invalid signature', {
      triedSources: verify.triedSources,
      hasSignature: !!signature,
      bodyLength: rawBody.length,
      envAndDbDiffer: diag.envAndDbSecretDiffer,
    })
    return NextResponse.json(
      {
        error: 'Invalid signature',
        hint:
          diag.envAndDbSecretDiffer
            ? 'Vercel env กับหน้าตั้งค่าไม่ตรง — ลบ/แก้ LINE_CHANNEL_SECRET บน Vercel ให้ตรง LINE Developers แล้ว Redeploy'
            : 'คัดลอก Channel secret ใหม่จาก LINE → Basic settings → ใส่ Vercel hrprogramkm → Redeploy',
        triedSecretSources: verify.triedSources,
        envAndDbSecretDiffer: diag.envAndDbSecretDiffer,
      },
      { status: 401 },
    )
  }

  if (process.env.NODE_ENV === 'production') {
    console.log('[line/webhook] signature ok via', verify.matchedSource)
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
