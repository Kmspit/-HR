import type { PrismaClient, Role } from '@prisma/client'

const EMPLOYEE_ROLES: Role[] = ['EMPLOYEE', 'LAWYER', 'ENFORCEMENT']

export type OrgHierarchyGapReason =
  | 'teamLeader'          // ไม่มี teamLeader ผูกไว้เลย
  | 'manager'             // ไม่มี manager ผูกไว้เลย
  | 'teamLeaderInactive'  // มี teamLeaderId แต่คนนั้นถูกปิดใช้งานแล้ว
  | 'managerInactive'     // มี managerId แต่คนนั้นถูกปิดใช้งานแล้ว

export type OrgHierarchyGap = {
  id: string
  name: string
  email: string
  role: Role
  department: string | null
  position: string | null
  teamLeaderId: string | null
  managerId: string | null
  missing: OrgHierarchyGapReason[]
}

export async function getOrgHierarchyGaps(prisma: PrismaClient): Promise<{
  gaps: OrgHierarchyGap[]
  totalActive: number
  gapCount: number
}> {
  const users = await prisma.user.findMany({
    where: { status: 'ACTIVE', role: { in: EMPLOYEE_ROLES } },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      department: true,
      position: true,
      teamLeaderId: true,
      managerId: true,
      teamLeader: { select: { status: true } },
      manager: { select: { status: true } },
    },
    orderBy: { name: 'asc' },
  })

  const gaps: OrgHierarchyGap[] = []
  for (const u of users) {
    const missing: OrgHierarchyGap['missing'] = []
    if (!u.teamLeaderId) missing.push('teamLeader')
    else if (u.teamLeader?.status !== 'ACTIVE') missing.push('teamLeaderInactive')
    if (!u.managerId) missing.push('manager')
    else if (u.manager?.status !== 'ACTIVE') missing.push('managerInactive')
    if (missing.length > 0) {
      const { teamLeader: _teamLeader, manager: _manager, ...rest } = u
      gaps.push({ ...rest, missing })
    }
  }

  return { gaps, totalActive: users.length, gapCount: gaps.length }
}
