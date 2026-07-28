import type { PrismaClient } from '@prisma/client'

/** Matches the scoping already established by GET/POST /api/debtors and
 * debtors/[id] PATCH: company-wide roles can act on any debtor, everyone
 * else only on debtors assigned to them. */
export const DEBTOR_MANAGE_ROLES = [
  'SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER',
]

/** Roles allowed to soft-delete/restore a debtor and view the "ลูกหนี้ที่ถูกลบ"
 * list — company-wide roles only (same set the DELETE route already required
 * before soft-delete existed). Keep this in sync with ROUTE_PERMISSIONS['/debtors/deleted']
 * in lib/access-control/index.ts and the Sidebar nav-item roles. */
export const DEBTOR_DELETE_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR']

export type DebtorAccessResult =
  | { status: 'not_found' }
  | { status: 'forbidden' }
  | { status: 'ok'; assignedToId: string | null }

/** Fetch a debtor's assignment and check whether the caller may access it
 * (view or mutate). Every debtors/[id]/** sub-resource route should gate on
 * this the same way the parent PATCH route does, instead of only checking
 * that a session exists. Soft-deleted debtors are treated as not_found so
 * every sub-resource route (contacts, payments, files, ...) automatically
 * stops surfacing data for a deleted debtor without each route re-checking. */
export async function checkDebtorAccess(
  prisma: PrismaClient,
  debtorId: string,
  userId: string,
  role: string,
): Promise<DebtorAccessResult> {
  const debtor = await prisma.debtor.findUnique({ where: { id: debtorId }, select: { assignedToId: true, deletedAt: true } })
  if (!debtor || debtor.deletedAt) return { status: 'not_found' }
  if (!DEBTOR_MANAGE_ROLES.includes(role) && debtor.assignedToId !== userId) {
    return { status: 'forbidden' }
  }
  return { status: 'ok', assignedToId: debtor.assignedToId }
}
