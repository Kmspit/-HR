import type { Role } from '@prisma/client'
import { ROUTE_PERMISSIONS } from '@/lib/access-control'

/** Longest-prefix first — `/attendance/scans` must win over `/attendance`. */
const SORTED_ROUTE_PREFIXES = Object.keys(ROUTE_PERMISSIONS).sort(
  (a, b) => b.length - a.length,
)

export function matchRoutePermission(pathname: string): string | null {
  return (
    SORTED_ROUTE_PREFIXES.find(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    ) ?? null
  )
}

export function rolesForPath(pathname: string): Role[] | null {
  const matched = matchRoutePermission(pathname)
  return matched ? ROUTE_PERMISSIONS[matched] : null
}

export function canAccessPath(role: Role, pathname: string): boolean {
  const allowed = rolesForPath(pathname)
  if (!allowed) return true
  return allowed.includes(role)
}
