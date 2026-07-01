import type { Role } from '@prisma/client'
import { HR_ADMIN } from '@/lib/module-gates'

export function canManageOrg(role: Role): boolean {
  return HR_ADMIN.includes(role)
}
