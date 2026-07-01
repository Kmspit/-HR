import type { PrismaClient, Role } from '@prisma/client'
import { canAccessUserProfile } from '@/lib/user-access'

/** Roles that approve company-wide (no org subtree filter). */
const COMPANY_WIDE_APPROVER_ROLES: Role[] = [
  'SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN',
]

export function isCompanyWideApprover(role: Role): boolean {
  return COMPANY_WIDE_APPROVER_ROLES.includes(role)
}

/** Roles that may list all employees' records (within branch scope). */
export function canListCompanyWideRecords(role: Role): boolean {
  return isCompanyWideApprover(role)
}

export type OrgListScope = 'ALL' | string[]

/** Which user ids a viewer may see in list APIs (includes self for supervisors). */
export async function resolveOrgListScope(
  prisma: PrismaClient,
  viewerId: string,
  viewerRole: Role,
): Promise<OrgListScope> {
  if (canListCompanyWideRecords(viewerRole)) return 'ALL'
  if (viewerRole === 'MANAGER' || viewerRole === 'TEAM_LEADER') {
    const reports = await getDirectReportUserIds(prisma, viewerId, viewerRole)
    return [viewerId, ...reports]
  }
  return [viewerId]
}

/** Prisma `userId` filter for list queries from org scope. */
export function userIdFilterFromScope(scope: OrgListScope): { userId?: string | { in: string[] } } {
  if (scope === 'ALL') return {}
  if (scope.length === 1) return { userId: scope[0] }
  return { userId: { in: scope } }
}

/** Whether viewer may read another user's HR record (attendance, leave, payroll). */
export async function canViewUserRecord(
  prisma: PrismaClient,
  viewerId: string,
  viewerRole: Role,
  viewerBranchId: string | null | undefined,
  targetUserId: string,
): Promise<boolean> {
  if (viewerId === targetUserId) return true
  const scope = await resolveOrgListScope(prisma, viewerId, viewerRole)
  if (scope === 'ALL') {
    return canAccessUserProfile(prisma, viewerId, viewerRole, viewerBranchId, targetUserId)
  }
  return scope.includes(targetUserId)
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
