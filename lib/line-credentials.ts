import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { verifyLineWebhookSignature } from '@/lib/line-api'

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

/** ตรวจว่า env กับ DB ใช้ secret ชุดเดียวกันหรือไม่ (ไม่เปิดเผยค่าจริง) */
export function lineCredentialFingerprint(value: string | undefined | null): string | null {
  const n = normalizeLineCredential(value)
  if (!n) return null
  return crypto.createHash('sha256').update(n).digest('hex').slice(0, 12)
}

/** รวม secret ทุกแหล่ง — ใช้ตรวจลายเซ็น (กรณี env ผิดแต่ DB ถูก) */
export async function listLineChannelSecretCandidates(): Promise<
  Array<{ secret: string; source: string }>
> {
  const seen = new Set<string>()
  const out: Array<{ secret: string; source: string }> = []
  const add = (raw: string | undefined | null, source: string) => {
    const s = normalizeLineCredential(raw)
    if (!s || seen.has(s)) return
    seen.add(s)
    out.push({ secret: s, source })
  }

  add(process.env.LINE_CHANNEL_SECRET, 'env:LINE_CHANNEL_SECRET')
  add(process.env.LINE_OA_CHANNEL_SECRET, 'env:LINE_OA_CHANNEL_SECRET')

  const row = await loadDbCredentials()
  add(row?.lineChannelSecret, 'database:company_settings')

  return out
}

export async function verifyLineWebhookWithCandidates(
  rawBody: string,
  signature: string | null,
): Promise<{ ok: boolean; matchedSource?: string; triedSources: string[] }> {
  const candidates = await listLineChannelSecretCandidates()
  const triedSources = candidates.map((c) => c.source)
  if (candidates.length === 0) {
    return { ok: false, triedSources: [] }
  }
  for (const c of candidates) {
    if (verifyLineWebhookSignature(rawBody, signature, c.secret)) {
      return { ok: true, matchedSource: c.source, triedSources }
    }
  }
  return { ok: false, triedSources }
}

/** ตรวจรูปแบบค่าใน LINE_CHANNEL_SECRET (พบบ่อย: ใส่ Access Token ผิดช่อง) */
export function auditLineChannelSecret(value: string | undefined): {
  length: number
  likelyWrong: boolean
  warning: string | null
} {
  const s = normalizeLineCredential(value)
  if (!s) {
    return { length: 0, likelyWrong: true, warning: 'ยังไม่มี Channel secret' }
  }
  if (s.length > 64) {
    return {
      length: s.length,
      likelyWrong: true,
      warning:
        'ค่ายาวผิดปกติ — มักใส่ Access Token ใน LINE_CHANNEL_SECRET แทน Channel secret (ดู Basic settings ไม่ใช่ Messaging API token)',
    }
  }
  if (s.includes('/') || s.startsWith('Bearer ')) {
    return {
      length: s.length,
      likelyWrong: true,
      warning: 'รูปแบบเหมือน Access Token — ใช้ Channel secret จาก Basic settings เท่านั้น',
    }
  }
  return { length: s.length, likelyWrong: false, warning: null }
}

export async function getLineWebhookDiagnostics() {
  const envSecret = secretFromEnv()
  const row = await loadDbCredentials()
  const dbSecret = normalizeLineCredential(row?.lineChannelSecret)
  const envFp = lineCredentialFingerprint(envSecret)
  const dbFp = lineCredentialFingerprint(dbSecret)
  const candidates = await listLineChannelSecretCandidates()
  const { token, source: tokenSource } = await resolveLineChannelAccessToken()
  const secretAudit = auditLineChannelSecret(envSecret ?? dbSecret)

  const warnings: string[] = []
  if (secretAudit.warning) warnings.push(secretAudit.warning)
  if (envFp && dbFp && envFp !== dbFp) {
    warnings.push(
      'env กับหน้าตั้งค่าไม่ตรงกัน — ลบ LINE_CHANNEL_SECRET บน Vercel หรือให้ตรงกัน',
    )
  }
  if (configuredBut401Hint(envSecret, token)) {
    warnings.push(
      'ถ้า Verify ยัง 401: ใน LINE กด Issue Channel secret ใหม่ → ใส่ Vercel hrprogramkm → Redeploy → Verify อีกครั้ง (Channel เดียวกับที่ตั้ง Webhook)',
    )
  }

  const configured = candidates.length > 0 && !!token

  return {
    configured,
    hasChannelSecret: candidates.length > 0,
    hasAccessToken: !!token,
    tokenSource,
    secretCandidateCount: candidates.length,
    triedSecretSources: candidates.map((c) => c.source),
    envAndDbSecretDiffer: !!(envFp && dbFp && envFp !== dbFp),
    envSecretFingerprint: envFp,
    dbSecretFingerprint: dbFp,
    secretLength: secretAudit.length,
    secretLooksWrong: secretAudit.likelyWrong,
    fix401IfDiffer:
      envFp && dbFp && envFp !== dbFp
        ? 'env กับ DB ไม่ตรงกัน — ลบ LINE_CHANNEL_SECRET บน Vercel หรืออัปเดตให้ตรง LINE Console แล้ว Redeploy'
        : secretAudit.warning,
    warnings,
  }
}

function configuredBut401Hint(
  secret: string | undefined,
  token: string | undefined,
): boolean {
  return !!secret && !!token
}
