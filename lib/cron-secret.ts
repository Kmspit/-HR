import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'

/** Vercel CRON_SECRET must be visible ASCII only. Invalid values are ignored. */
export function expectedCronSecret(): string | null {
  const raw = process.env.CRON_SECRET?.trim()
  if (!raw) return process.env.HRFLOW_CRON_SECRET?.trim() ?? null
  if (!/^[\x20-\x7E]+$/.test(raw)) return process.env.HRFLOW_CRON_SECRET?.trim() ?? null
  return raw
}

function secretsEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export function cronRequestAuthorized(
  authorization: string | null,
  headerSecret: string | null,
): boolean {
  const expected = expectedCronSecret()
  if (!expected) return false
  const bearer = authorization?.replace(/^Bearer\s+/i, '').trim()
  if (bearer && secretsEqual(bearer, expected)) return true
  if (headerSecret && secretsEqual(headerSecret.trim(), expected)) return true
  return false
}

/** Returns 401 response if unauthorized; null if OK to proceed. */
export function rejectUnauthorizedCron(req: NextRequest): NextResponse | null {
  const headerSecret = req.headers.get('x-cron-secret')
  if (!cronRequestAuthorized(req.headers.get('authorization'), headerSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}