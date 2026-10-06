import type { Role } from '@prisma/client'
import { canAccessPage } from '@/lib/page-access'
import { matchEligiblePath, OVERRIDE_ELIGIBLE_PATH_DEFAULT_ROLES } from '@/lib/override-eligible-paths'
import type { SmartAlert } from './types'

/** Drop alert links the viewer cannot access (middleware would block).
 *
 *  Deliberately role-only, not per-user-override-aware: this function has no
 *  userId in scope (BranchScopeInput doesn't carry one) and is UI-only
 *  (hiding a shortcut link, not a security boundary — the real enforcement
 *  is canAccessPageForUser() at the page/API layer), so threading an async
 *  per-user DB lookup through here isn't worth the complexity for a GRANT to
 *  additionally surface this one convenience link. A RESTRICT MUST still
 *  hide it correctly for the 3 override-eligible paths though — their
 *  ROUTE_PERMISSIONS entries were widened to ALL_ROLES (so canAccessPage()
 *  alone would wrongly show these links to every role), so this checks
 *  OVERRIDE_ELIGIBLE_PATH_DEFAULT_ROLES (the real default) for those 3
 *  specifically instead. */
export function gateSmartAlerts(alerts: SmartAlert[], role: Role): SmartAlert[] {
  return alerts.map((a) => {
    if (!a.href || a.count <= 0) return a
    const eligiblePath = matchEligiblePath(a.href)
    const allowed = eligiblePath
      ? OVERRIDE_ELIGIBLE_PATH_DEFAULT_ROLES[eligiblePath].includes(role)
      : canAccessPage(role, a.href)
    return allowed ? a : { ...a, href: undefined }
  })
}
