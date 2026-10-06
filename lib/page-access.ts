import type { Role } from '@prisma/client'
import { rolesForPath } from '@/lib/route-match'

/** Whether role may access a dashboard page path (matches middleware RBAC).
 *  Role-only — unaffected by per-user overrides. Still correct to use as-is
 *  for every path NOT in OVERRIDE_ELIGIBLE_PATHS (the vast majority). For the
 *  3 override-eligible paths, prefer canAccessPageForUser() in
 *  lib/page-access-server.ts so a GRANT/RESTRICT override actually takes
 *  effect.
 *
 *  Kept free of any Prisma-touching import on purpose — components/smart-
 *  dashboard/SmartDashboard.tsx ('use client') imports this function, so
 *  this module must stay safe to pull into a client bundle. The per-user,
 *  DB-backed check lives in the separate lib/page-access-server.ts instead. */
export function canAccessPage(role: Role, path: string): boolean {
  const pathname = path.split('?')[0]
  const allowed = rolesForPath(pathname)
  if (!allowed) return true
  return allowed.includes(role)
}
