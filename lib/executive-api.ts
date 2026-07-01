import type { Role } from '@prisma/client'
import { EXEC_ONLY } from '@/lib/module-gates'

/** Executive dashboard APIs — matches middleware `/executive` (CEO + SUPER_ADMIN only). */
export function canAccessExecutiveApi(role: Role): boolean {
  return EXEC_ONLY.includes(role)
}
