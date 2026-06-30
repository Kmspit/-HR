import type { PrismaClient, Role } from '@prisma/client'

const EMPLOYEE_ROLES: Role[] = ['EMPLOYEE', 'LAWYER', 'ENFORCEMENT']

export type OrgHierarchyGap = {
  id: string
  name: string
  email: string
  role: Role
  department: string | null
  position: string | null
  teamLeaderId: string | null
  managerId: string | null
  missing: ('teamLeader' | 'manager')[]
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
    },
    orderBy: { name: 'asc' },
  })

  const gaps: OrgHierarchyGap[] = []
  for (const u of users) {
    const missing: OrgHierarchyGap['missing'] = []
    if (!u.teamLeaderId) missing.push('teamLeader')
    if (!u.managerId) missing.push('manager')
    if (missing.length > 0) {
      gaps.push({ ...u, missing })
    }
  }

  return { gaps, totalActive: users.length, gapCount: gaps.length }
}
