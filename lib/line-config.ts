import { normalizeLineCredential } from '@/lib/line-credentials'
import { sanitizeLineAccessTokenForHeader } from '@/lib/line-http-headers'

/** LINE Messaging API — รองรับชื่อ env หลายแบบ (sync; webhook ใช้ resolveLineChannelSecret แทน) */
export function getLineChannelAccessToken(): string | undefined {
  const raw =
    normalizeLineCredential(process.env.LINE_CHANNEL_ACCESS_TOKEN) ||
    normalizeLineCredential(process.env.LINE_OA_ACCESS_TOKEN)
  if (!raw) return undefined
  const s = sanitizeLineAccessTokenForHeader(raw)
  return s.ok ? s.token : undefined
}

export function getLineChannelSecret(): string | undefined {
  return (
    normalizeLineCredential(process.env.LINE_CHANNEL_SECRET) ||
    normalizeLineCredential(process.env.LINE_OA_CHANNEL_SECRET)
  )
}

export function getLineWebhookUrl(): string {
  const base = (process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '').replace(
    /\/$/,
    '',
  )
  return `${base}/api/line/webhook`
}

export function isLineOaConfigured(): boolean {
  return !!getLineChannelAccessToken() && !!getLineChannelSecret()
}

/** ตรวจ LINE OA รวม token จาก DB (หน้าตั้งค่า) — ใช้ก่อนส่งแจ้ง HR */
export async function isLineOaConfiguredAsync(): Promise<boolean> {
  const { resolveLineChannelAccessToken, resolveLineChannelSecret } = await import(
    '@/lib/line-credentials'
  )
  const [tokenRes, secretRes] = await Promise.all([
    resolveLineChannelAccessToken(),
    resolveLineChannelSecret(),
  ])
  return !!tokenRes.token && tokenRes.tokenValid !== false && !!secretRes.secret
}

/** สำหรับหน้า debug webhook — ไม่แสดงค่า secret */
export function getLineConfigStatus() {
  const secret =
    !!process.env.LINE_CHANNEL_SECRET?.trim() || !!process.env.LINE_OA_CHANNEL_SECRET?.trim()
  const token =
    !!process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() ||
    !!process.env.LINE_OA_ACCESS_TOKEN?.trim()
  return {
    configured: secret && token,
    hasChannelSecret: secret,
    hasAccessToken: token,
    webhookPath: '/api/line/webhook',
    webhookUrl: getLineWebhookUrl(),
    envNames: {
      secret: 'LINE_CHANNEL_SECRET (หรือ LINE_OA_CHANNEL_SECRET)',
      token: 'LINE_CHANNEL_ACCESS_TOKEN (หรือ LINE_OA_ACCESS_TOKEN)',
    },
  }
}
