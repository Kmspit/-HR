/** LINE Messaging API — รองรับชื่อ env หลายแบบ */
export function getLineChannelAccessToken(): string | undefined {
  return (
    process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() ||
    process.env.LINE_OA_ACCESS_TOKEN?.trim() ||
    undefined
  )
}

export function getLineChannelSecret(): string | undefined {
  return (
    process.env.LINE_CHANNEL_SECRET?.trim() ||
    process.env.LINE_OA_CHANNEL_SECRET?.trim() ||
    undefined
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
