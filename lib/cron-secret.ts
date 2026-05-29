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
