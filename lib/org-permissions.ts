import type { Role } from '@prisma/client'

export function canManageOrg(role: Role): boolean {
  return role === 'MANAGER_HR' || role === 'ADMIN'
}
