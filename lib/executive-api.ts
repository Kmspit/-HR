import type { Role } from '@prisma/client'
import { canAccessPageForUser } from '@/lib/page-access-server'

/** Executive dashboard APIs — default CEO + SUPER_ADMIN only (EXEC_ONLY), but
 *  a specific user can be GRANTed in or RESTRICTed out via a per-user
 *  '/executive' override (lib/override-eligible-paths.ts) — see
 *  canAccessPageForUser() for the shared enforcement logic. */
export async function canAccessExecutiveApi(userId: string, role: Role): Promise<boolean> {
  return canAccessPageForUser(userId, role, '/executive')
}
