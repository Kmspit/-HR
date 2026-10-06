import type { Role } from '@prisma/client'
import { canAccessPage } from '@/lib/page-access'
import { matchEligiblePath, OVERRIDE_ELIGIBLE_PATH_DEFAULT_ROLES } from '@/lib/override-eligible-paths'
import { getCachedUserPagePermissions } from '@/lib/user-page-permissions-cache'

/**
 * Override-aware access check (2026-10-02) — the ONLY check that may differ
 * from canAccessPage()'s answer, and only for the 3 paths in
 * OVERRIDE_ELIGIBLE_PATHS (lib/override-eligible-paths.ts). Falls back to
 * canAccessPage() identically for every other path, so this can safely
 * replace canAccessPage() at any call site without changing behavior outside
 * the curated list.
 *
 * Must be called from both the page.tsx Server Component for each
 * override-eligible path AND every API route that page calls — their
 * ROUTE_PERMISSIONS entries were widened to ALL_ROLES specifically so
 * middleware lets every staff role through to these Node-runtime checks
 * (see the comment on '/payroll'/'/reports'/'/executive' in
 * lib/access-control/index.ts). Page-shell gating alone is NOT sufficient.
 *
 * Deliberately kept in its OWN file, separate from lib/page-access.ts: this
 * function's dependency chain reaches Prisma (via
 * lib/user-page-permissions-cache.ts), and lib/page-access.ts's
 * canAccessPage() is imported by a 'use client' component
 * (components/smart-dashboard/SmartDashboard.tsx) — that file must never
 * transitively pull Prisma into a client bundle.
 */
export async function canAccessPageForUser(
  userId: string,
  role: Role,
  path: string,
): Promise<boolean> {
  const pathname = path.split('?')[0]

  const eligiblePath = matchEligiblePath(pathname)
  if (!eligiblePath) return canAccessPage(role, pathname)

  // IMPORTANT: do NOT fall back to canAccessPage()/ROUTE_PERMISSIONS here —
  // these 3 paths' ROUTE_PERMISSIONS entries were deliberately widened to
  // ALL_ROLES so middleware lets every staff role through to this very
  // check. Using that widened value as "default access" would make every
  // role look allowed, silently defeating RESTRICT and making GRANT
  // meaningless. OVERRIDE_ELIGIBLE_PATH_DEFAULT_ROLES holds the real,
  // original role list instead.
  const roleAllowed = OVERRIDE_ELIGIBLE_PATH_DEFAULT_ROLES[eligiblePath].includes(role)

  const overrides = await getCachedUserPagePermissions(userId)
  const override = overrides.find((o) => o.path === eligiblePath)
  if (!override) return roleAllowed
  return override.direction === 'GRANT'
}
