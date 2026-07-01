import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

/** Vercel CRON_SECRET must be visible ASCII only. Invalid values are ignored. */
export function expectedCronSecret(): string | null {
  const raw = process.env.CRON_SECRET?.trim()
  if (!raw) return process.env.HRFLOW_CRON_SECRET?.trim() ?? null
  if (!/^[\x20-\x7E]+$/.test(raw)) return process.env.HRFLOW_CRON_SECRET?.trim() ?? null
  return raw
}

export function cronRequestAuthorized(
  authorization: string | null,
  headerOrQuerySecret: string | null,
): boolean {
  const expected = expectedCronSecret()
  if (!expected) return false
  const bearer = authorization?.replace(/^Bearer\s+/i, '')
  return bearer === expected || headerOrQuerySecret === expected
}

/** Returns 401 response if unauthorized; null if OK to proceed. */
export function rejectUnauthorizedCron(req: NextRequest): NextResponse | null {
  const secret =
    req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (!cronRequestAuthorized(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
