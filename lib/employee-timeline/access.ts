import type { PrismaClient, Role } from '@prisma/client'
import { canManageUsers } from '@/lib/permissions'
import { canApproverActOnRequester } from '@/lib/org-scope'

const COMPANY_WIDE_ROLES: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR']

/** Whether viewer may open an employee's audit timeline (org/branch scoped). */
export async function canViewEmployeeTimeline(
  prisma: PrismaClient,
  viewerId: string,
  viewerRole: Role,
  viewerBranchId: string | null | undefined,
  targetUserId: string,
): Promise<boolean> {
  if (!canManageUsers(viewerRole)) return false

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { branchId: true, managerId: true, teamLeaderId: true },
  })
  if (!target) return false

  if (COMPANY_WIDE_ROLES.includes(viewerRole)) return true

  if (viewerRole === 'HR' || viewerRole === 'ADMIN') {
    if (!viewerBranchId) return true
    return target.branchId === viewerBranchId
  }

  if (viewerRole === 'MANAGER' || viewerRole === 'TEAM_LEADER') {
    return canApproverActOnRequester(prisma, viewerId, viewerRole, targetUserId)
  }

  return false
}
