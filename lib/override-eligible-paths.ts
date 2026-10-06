import type { Role } from '@prisma/client'
import { EXEC_ONLY } from '@/lib/module-gates'

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
 *
 * 2026-10-09 — /payroll and /reports TEMPORARILY removed (an independent
 * review found their underlying data queries are branch-scoped via
 * lib/branch-scope.ts's resolveFilterBranchId(), which today treats "not
 * EMPLOYEE/LAWYER" as "see every branch" — so a GRANT'd TEAM_LEADER/MANAGER
 * would see the WHOLE COMPANY's salary data, not just a narrower slice;
 * even a GRANT'd EMPLOYEE sees every coworker's salary in their own branch,
 * not just their own row). Re-add only after resolveFilterBranchId is fixed
 * to fail-closed (see its own doc comment) and re-verified against these 2
 * paths specifically. /executive has no salary data and no branch-scoping
 * at all (it's an inherently company-wide legal/debt-collection dashboard
 * by design — see its own route files), so it's unaffected and stays.
 */
export const OVERRIDE_ELIGIBLE_PATHS = ['/executive'] as const

export type OverrideEligiblePath = (typeof OVERRIDE_ELIGIBLE_PATHS)[number]

export function isOverrideEligiblePath(path: string): path is OverrideEligiblePath {
  return (OVERRIDE_ELIGIBLE_PATHS as readonly string[]).includes(path)
}

/**
 * The role list each eligible path's ROUTE_PERMISSIONS entry held BEFORE it
 * was widened to ALL_ROLES for middleware's sake — i.e. the real, intended
 * "default access, no override" answer. canAccessPage()/ROUTE_PERMISSIONS
 * can NOT be used for this anymore for these paths specifically, since
 * their ROUTE_PERMISSIONS entries were deliberately widened to let every
 * staff role past the Edge gate — that widened value would make every role
 * look "allowed by default," silently defeating RESTRICT and making GRANT
 * meaningless. This map is the one true source for "would this role see
 * this page absent any override."
 */
export const OVERRIDE_ELIGIBLE_PATH_DEFAULT_ROLES: Record<OverrideEligiblePath, Role[]> = {
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
 *  lib/route-match.ts's matching logic but only ever resolves to a curated
 *  eligible-path key (or null), never the full ROUTE_PERMISSIONS map. */
export function matchEligiblePath(path: string): OverrideEligiblePath | null {
  const sorted = [...OVERRIDE_ELIGIBLE_PATHS].sort((a, b) => b.length - a.length)
  const matched = sorted.find((p) => path === p || path.startsWith(`${p}/`))
  return matched ?? null
}
