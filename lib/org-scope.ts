import type { PrismaClient, Role } from '@prisma/client'

/** Roles that approve company-wide (no org subtree filter). */
const COMPANY_WIDE_APPROVER_ROLES: Role[] = [
  'SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN',
]

export function isCompanyWideApprover(role: Role): boolean {
  return COMPANY_WIDE_APPROVER_ROLES.includes(role)
}

/** Direct report user ids for team leader / manager approvers. */
export async function getDirectReportUserIds(
  prisma: PrismaClient,
  userId: string,
  role: Role,
): Promise<string[]> {
  if (role === 'TEAM_LEADER') {
    const rows = await prisma.user.findMany({
      where: { teamLeaderId: userId, status: 'ACTIVE' },
      select: { id: true },
    })
    return rows.map((r) => r.id)
  }
  if (role === 'MANAGER') {
    const rows = await prisma.user.findMany({
      where: { managerId: userId, status: 'ACTIVE' },
      select: { id: true },
    })
    return rows.map((r) => r.id)
  }
  return []
}

/** Whether approver may act on a request from requesterId. */
export async function canApproverActOnRequester(
  prisma: PrismaClient,
  approverId: string,
  approverRole: Role,
  requesterId: string,
): Promise<boolean> {
  if (isCompanyWideApprover(approverRole)) return true
  if (approverRole === 'TEAM_LEADER' || approverRole === 'MANAGER') {
    const reports = await getDirectReportUserIds(prisma, approverId, approverRole)
    return reports.includes(requesterId)
  }
  return false
}
