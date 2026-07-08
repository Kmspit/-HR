import type { PrismaClient } from '@prisma/client'

/** Matches the scoping already established by GET/POST /api/debtors and
 * debtors/[id] PATCH: company-wide roles can act on any debtor, everyone
 * else only on debtors assigned to them. */
export const DEBTOR_MANAGE_ROLES = [
  'SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER',
]

export type DebtorAccessResult =
  | { status: 'not_found' }
  | { status: 'forbidden' }
  | { status: 'ok'; assignedToId: string | null }

/** Fetch a debtor's assignment and check whether the caller may access it
 * (view or mutate). Every debtors/[id]/** sub-resource route should gate on
 * this the same way the parent PATCH route does, instead of only checking
 * that a session exists. */
export async function checkDebtorAccess(
  prisma: PrismaClient,
  debtorId: string,
  userId: string,
  role: string,
): Promise<DebtorAccessResult> {
  const debtor = await prisma.debtor.findUnique({ where: { id: debtorId }, select: { assignedToId: true } })
  if (!debtor) return { status: 'not_found' }
  if (!DEBTOR_MANAGE_ROLES.includes(role) && debtor.assignedToId !== userId) {
    return { status: 'forbidden' }
  }
  return { status: 'ok', assignedToId: debtor.assignedToId }
}
