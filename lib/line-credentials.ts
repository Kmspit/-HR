import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { verifyLineWebhookSignature } from '@/lib/line-api'
import { sanitizeLineAccessTokenForHeader } from '@/lib/line-http-headers'

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
  const raw =
    normalizeLineCredential(process.env.LINE_CHANNEL_ACCESS_TOKEN) ||
    normalizeLineCredential(process.env.LINE_OA_ACCESS_TOKEN)
  if (!raw) return undefined
  const s = sanitizeLineAccessTokenForHeader(raw)
  return s.ok ? s.token : undefined
}

let cache: {
  at: number
  secret?: string
  token?: string
  tokenValid?: boolean
  botDisplayName?: string
  secretSource?: 'env' | 'database'
  tokenSource?: 'env' | 'database'
  tokenSourceDetail?: string
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

/** รวม access token ทุกแหล่ง (ลำดับ env ก่อน DB) */
export async function listLineAccessTokenCandidates(): Promise<
  Array<{ token: string; source: string }>
> {
  const seen = new Set<string>()
  const out: Array<{ token: string; source: string }> = []
  const add = (raw: string | undefined | null, source: string) => {
    const s = sanitizeLineAccessTokenForHeader(raw)
    if (!s.ok || seen.has(s.token)) return
    seen.add(s.token)
    out.push({ token: s.token, source })
  }

  add(process.env.LINE_CHANNEL_ACCESS_TOKEN, 'env:LINE_CHANNEL_ACCESS_TOKEN')
  add(process.env.LINE_OA_ACCESS_TOKEN, 'env:LINE_OA_ACCESS_TOKEN')

  const row = await loadDbCredentials()
  add(row?.lineAccessToken, 'database:company_settings')

  return out
}

type TokenSource = 'env' | 'database' | 'none'

/** Access Token — เลือกตัวที่ LINE API ยอมรับ (แก้ env ผิดแต่ DB ถูก) */
export async function resolveLineChannelAccessToken(): Promise<{
  token?: string
  source: TokenSource
  tokenSourceDetail?: string
  tokenValid?: boolean
  botDisplayName?: string
  validationError?: string
}> {
  const now = Date.now()
  if (cache?.tokenValid && cache.token && now - cache.at < CACHE_MS) {
    return {
      token: cache.token,
      source: (cache.tokenSource ?? 'env') as TokenSource,
      tokenSourceDetail: cache.tokenSourceDetail,
      tokenValid: true,
      botDisplayName: cache.botDisplayName,
    }
  }

  const candidates = await listLineAccessTokenCandidates()
  if (candidates.length === 0) {
    return { source: 'none', tokenValid: false }
  }

  const { validateLineAccessToken } = await import('@/lib/line-api')
  let lastError: string | undefined

  for (const c of candidates) {
    const v = await validateLineAccessToken(c.token)
    if (v.ok) {
      const src: TokenSource = c.source.startsWith('database') ? 'database' : 'env'
      cache = {
        at: now,
        token: c.token,
        tokenValid: true,
        botDisplayName: v.displayName,
        tokenSource: src,
        tokenSourceDetail: c.source,
        secret: cache?.secret,
        secretSource: cache?.secretSource,
      }
      return {
        token: c.token,
        source: src,
        tokenSourceDetail: c.source,
        tokenValid: true,
        botDisplayName: v.displayName,
      }
    }
    lastError = v.error
    console.warn('[line-credentials] token invalid for', c.source, v.error)
  }

  const fallback = candidates[0]
  const src: TokenSource = fallback.source.startsWith('database') ? 'database' : 'env'
  cache = {
    at: now,
    token: fallback.token,
    tokenValid: false,
    tokenSource: src,
    tokenSourceDetail: fallback.source,
    secret: cache?.secret,
    secretSource: cache?.secretSource,
  }
  return {
    token: fallback.token,
    source: src,
    tokenSourceDetail: fallback.source,
    tokenValid: false,
    validationError: lastError,
  }
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
  const tokenResolve = await resolveLineChannelAccessToken()
  const token = tokenResolve.token
  const tokenSource = tokenResolve.source === 'none' ? undefined : tokenResolve.source
  const secretAudit = auditLineChannelSecret(envSecret ?? dbSecret)

  const warnings: string[] = []
  if (secretAudit.warning) warnings.push(secretAudit.warning)
  if (envFp && dbFp && envFp !== dbFp) {
    warnings.push(
      'env กับหน้าตั้งค่าไม่ตรงกัน — ลบ LINE_CHANNEL_SECRET บน Vercel หรือให้ตรงกัน',
    )
  }
  if (token && tokenResolve.tokenValid === false) {
    warnings.push(
      tokenResolve.validationError ??
        'LINE Access Token ไม่ถูกต้อง — Issue ใหม่ใน Messaging API → ใส่ LINE_CHANNEL_ACCESS_TOKEN บน Vercel hrprogramkm → Redeploy',
    )
  }
  if (configuredBut401Hint(envSecret, token) && tokenResolve.tokenValid) {
    warnings.push(
      'ถ้า Verify ยัง 401: ใน LINE กด Issue Channel secret ใหม่ → ใส่ Vercel hrprogramkm → Redeploy → Verify อีกครั้ง (Channel เดียวกับที่ตั้ง Webhook)',
    )
  }

  const configured =
    candidates.length > 0 && !!token && tokenResolve.tokenValid === true

  return {
    configured,
    hasChannelSecret: candidates.length > 0,
    hasAccessToken: !!token,
    accessTokenValid: tokenResolve.tokenValid ?? false,
    accessTokenSourceDetail: tokenResolve.tokenSourceDetail,
    botDisplayName: tokenResolve.botDisplayName,
    accessTokenError: tokenResolve.validationError,
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
