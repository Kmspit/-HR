import { prisma } from '@/lib/prisma'
import type { PageOverrideDirection } from '@prisma/client'

// Per-user page-access overrides are read on literally every protected-page
// render and API call for the 3 override-eligible paths (lib/override-
// eligible-paths.ts), but change rarely (HR edits them manually, a handful of
// times total). Same short in-memory TTL cache pattern as
// lib/company-settings-cache.ts / lib/line-credentials.ts, keyed per-user
// since (unlike those two) this isn't a single global row.
//
// Explicit select only — never full-select this model (see CONTRIBUTING.md
// #4): a newly added schema field can lag behind the actual DB column until
// the ensure-db-schema migration runs, and a full-select would 500 in that
// window.
const CACHED_OVERRIDE_SELECT = {
  path: true,
  direction: true,
} as const

export type CachedPageOverride = { path: string; direction: PageOverrideDirection }

const CACHE_MS = 45_000

const cache = new Map<string, { at: number; value: CachedPageOverride[] }>()

async function fetchFresh(userId: string): Promise<CachedPageOverride[]> {
  try {
    return await prisma.pagePermissionOverride.findMany({
      where: { userId },
      select: CACHED_OVERRIDE_SELECT,
    })
  } catch (err) {
    // Degrade to "no overrides" (pure role-based fallback) rather than 500 —
    // same defensive fallback as company-settings-cache.ts's fetchFresh().
    console.error('[user-page-permissions-cache] DB read failed', err)
    return []
  }
}

/** Cached read of a user's page-permission overrides (max 3 rows — one per OVERRIDE_ELIGIBLE_PATHS entry). */
export async function getCachedUserPagePermissions(userId: string): Promise<CachedPageOverride[]> {
  const now = Date.now()
  const hit = cache.get(userId)
  if (hit && now - hit.at < CACHE_MS) return hit.value
  const value = await fetchFresh(userId)
  cache.set(userId, { at: now, value })
  return value
}

/** Invalidate immediately — call after any write to PagePermissionOverride for this user. */
export function clearUserPagePermissionsCache(userId: string) {
  cache.delete(userId)
}
