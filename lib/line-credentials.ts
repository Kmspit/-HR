import { prisma } from '@/lib/prisma'

/** ลบช่องว่าง/เครื่องหมายคำพูดที่ copy จาก .env หรือ Vercel ผิดรูปแบบ */
export function normalizeLineCredential(
  value: string | undefined | null,
): string | undefined {
  if (value == null) return undefined
  let t = String(value).trim()
  if (!t) return undefined
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    t = t.slice(1, -1).trim()
  }
  return t || undefined
}

function secretFromEnv(): string | undefined {
  return (
    normalizeLineCredential(process.env.LINE_CHANNEL_SECRET) ||
    normalizeLineCredential(process.env.LINE_OA_CHANNEL_SECRET)
  )
}

function tokenFromEnv(): string | undefined {
  return (
    normalizeLineCredential(process.env.LINE_CHANNEL_ACCESS_TOKEN) ||
    normalizeLineCredential(process.env.LINE_OA_ACCESS_TOKEN)
  )
}

let cache: {
  at: number
  secret?: string
  token?: string
  secretSource?: 'env' | 'database'
  tokenSource?: 'env' | 'database'
} | null = null

const CACHE_MS = 45_000

async function loadDbCredentials() {
  try {
    return await prisma.companySettings.findUnique({
      where: { id: 'singleton' },
      select: { lineChannelSecret: true, lineAccessToken: true },
    })
  } catch (err) {
    console.error('[line-credentials] DB read failed', err)
    return null
  }
}

/** Channel Secret สำหรับ verify webhook — env ก่อน แล้วค่อย company_settings */
export async function resolveLineChannelSecret(): Promise<{
  secret?: string
  source: 'env' | 'database' | 'none'
}> {
  const fromEnv = secretFromEnv()
  if (fromEnv) {
    return { secret: fromEnv, source: 'env' }
  }

  const now = Date.now()
  if (cache && now - cache.at < CACHE_MS && cache.secret) {
    return { secret: cache.secret, source: cache.secretSource ?? 'database' }
  }

  const row = await loadDbCredentials()
  const fromDb = normalizeLineCredential(row?.lineChannelSecret)
  if (fromDb) {
    cache = {
      at: now,
      secret: fromDb,
      token: cache?.token,
      secretSource: 'database',
      tokenSource: cache?.tokenSource,
    }
    return { secret: fromDb, source: 'database' }
  }

  return { source: 'none' }
}

/** Access Token — env ก่อน แล้วค่อย company_settings */
export async function resolveLineChannelAccessToken(): Promise<{
  token?: string
  source: 'env' | 'database' | 'none'
}> {
  const fromEnv = tokenFromEnv()
  if (fromEnv) {
    return { token: fromEnv, source: 'env' }
  }

  const now = Date.now()
  if (cache && now - cache.at < CACHE_MS && cache.token) {
    return { token: cache.token, source: cache.tokenSource ?? 'database' }
  }

  const row = await loadDbCredentials()
  const fromDb = normalizeLineCredential(row?.lineAccessToken)
  if (fromDb) {
    cache = {
      at: now,
      token: fromDb,
      secret: cache?.secret,
      secretSource: cache?.secretSource,
      tokenSource: 'database',
    }
    return { token: fromDb, source: 'database' }
  }

  return { source: 'none' }
}

export function clearLineCredentialsCache() {
  cache = null
}
