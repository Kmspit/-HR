import { prisma } from '@/lib/prisma'

// CompanySettings changes a handful of times a year, but it was being
// re-queried on every request of the app's busiest endpoints (checkin,
// checkout, lunch, ...). Short in-memory TTL cache, same pattern as
// lib/line-credentials.ts's own 45s cache for the LINE-specific fields.
//
// Explicit select only — never full-select this model (see CONTRIBUTING.md
// #4): a newly added schema field can lag behind the actual DB column until
// the ensure-db-schema migration runs, and a full-select would 500 in that
// window. This select is a superset of every field any cached call site
// currently reads.
const CACHED_SETTINGS_SELECT = {
  id: true,
  companyName: true,
  outsideWorkPlanTitle: true,
  workStartTime: true,
  workEndTime: true,
  lunchReturnTime: true,
  lateGraceMin: true,
  geofenceLat: true,
  geofenceLng: true,
  geofenceRadius: true,
  probationMonths: true,
  sickDaysYear: true,
  vacationDaysYear: true,
  personalDaysYear: true,
  absentDeductRate: true,
  imageRetentionDays: true,
  lineChannelId: true,
} as const

export type CachedCompanySettings = Awaited<ReturnType<typeof fetchFresh>>

const CACHE_MS = 45_000

let cache: { at: number; value: CachedCompanySettings } | null = null

async function fetchFresh() {
  try {
    return await prisma.companySettings.findUnique({
      where: { id: 'singleton' },
      select: CACHED_SETTINGS_SELECT,
    })
  } catch (err) {
    // Same defensive fallback as lib/line-credentials.ts's loadDbCredentials()
    // — a field in this select can lag behind the actual DB column until the
    // ensure-db-schema migration runs; degrade to "no settings" rather than 500.
    console.error('[company-settings-cache] DB read failed', err)
    return null
  }
}

/** Cached read of the CompanySettings singleton row. */
export async function getCachedCompanySettings(): Promise<CachedCompanySettings> {
  const now = Date.now()
  if (cache && now - cache.at < CACHE_MS) return cache.value
  const value = await fetchFresh()
  cache = { at: now, value }
  return value
}

/** Invalidate immediately — call after any write to CompanySettings so readers never see stale data for up to CACHE_MS. */
export function clearCompanySettingsCache() {
  cache = null
}
