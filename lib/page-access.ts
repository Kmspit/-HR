import type { Role } from '@prisma/client'
import { rolesForPath } from '@/lib/route-match'

/** Whether role may access a dashboard page path (matches middleware RBAC). */
export function canAccessPage(role: Role, path: string): boolean {
  const pathname = path.split('?')[0]
  const allowed = rolesForPath(pathname)
  if (!allowed) return true
  return allowed.includes(role)
}
