import type { Role } from '@prisma/client'
import { HR_CORE, MGR_UP, EXEC_ONLY } from '@/lib/module-gates'

/**
 * The ONLY paths a per-user PagePermissionOverride (GRANT or RESTRICT) may
 * target in v1 — deliberately a small, explicitly curated allowlist rather
 * than every route in the app, to keep the blast radius of this
 * security-sensitive feature bounded and reviewable. Adding a path here
 * requires simultaneously widening its ROUTE_PERMISSIONS entry in
 * lib/access-control/index.ts to ALL_ROLES (so middleware lets every staff
 * role through to the Node-runtime check) and adding the canAccessPageForUser
 * guard to that path's page.tsx AND every API route it calls — see
 * lib/page-access.ts's canAccessPageForUser().
 *
 * Keys must exactly match a key in ROUTE_PERMISSIONS. Note sub-routes with
 * their own separate, stricter ROUTE_PERMISSIONS key (e.g. /payroll/deleted)
 * do NOT inherit an override on their parent path — longest-prefix matching
 * resolves them to their own key, which is intentionally excluded here.
 */
export const OVERRIDE_ELIGIBLE_PATHS = ['/payroll', '/reports', '/executive'] as const

export type OverrideEligiblePath = (typeof OVERRIDE_ELIGIBLE_PATHS)[number]

export function isOverrideEligiblePath(path: string): path is OverrideEligiblePath {
  return (OVERRIDE_ELIGIBLE_PATHS as readonly string[]).includes(path)
}

/**
 * The role list each eligible path's ROUTE_PERMISSIONS entry held BEFORE it
 * was widened to ALL_ROLES for middleware's sake — i.e. the real, intended
 * "default access, no override" answer. canAccessPage()/ROUTE_PERMISSIONS
 * can NOT be used for this anymore for these 3 paths specifically, since
 * their ROUTE_PERMISSIONS entries were deliberately widened to let every
 * staff role past the Edge gate — that widened value would make every role
 * look "allowed by default," silently defeating RESTRICT and making GRANT
 * meaningless. This map is the one true source for "would this role see
 * this page absent any override."
 */
export const OVERRIDE_ELIGIBLE_PATH_DEFAULT_ROLES: Record<OverrideEligiblePath, Role[]> = {
  '/payroll': HR_CORE,
  '/reports': MGR_UP,
  '/executive': EXEC_ONLY,
}

/** Only these 3 roles may grant/restrict a page-access override — narrower
 *  than HR_ADMIN (drops HR/ADMIN): GRANT bypasses a role's normal page gate
 *  entirely, which is more sensitive than the baseSalary/role-assignment
 *  edits HR_ADMIN is already trusted with elsewhere on the employee-edit
 *  page. Used by both PUT /api/users/[id]/page-permissions and the
 *  employees/[id]/page.tsx prop that gates rendering the UI section. */
export const OVERRIDE_MANAGER_ROLES: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR']

/** Longest-prefix match restricted to OVERRIDE_ELIGIBLE_PATHS — mirrors
 *  lib/route-match.ts's matching logic but only ever resolves to one of
 *  these 3 keys (or null), never the full ROUTE_PERMISSIONS map. */
export function matchEligiblePath(path: string): OverrideEligiblePath | null {
  const sorted = [...OVERRIDE_ELIGIBLE_PATHS].sort((a, b) => b.length - a.length)
  const matched = sorted.find((p) => path === p || path.startsWith(`${p}/`))
  return matched ?? null
}
