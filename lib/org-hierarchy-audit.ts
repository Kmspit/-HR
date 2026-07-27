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

// ── Inactive-assignee gaps (active case/task still assigned to a deactivated
// employee — e.g. an offboarded lawyer's cases with no reassignment prompt) ──
// Deliberately a separate export with its own shape from getOrgHierarchyGaps
// above: this is about specific case/task records tied to a non-ACTIVE
// employee, not about an ACTIVE employee's manager/teamLeader links, so
// merging the two into one function/type would conflate two different kinds
// of gaps for no benefit and risk regressing the existing categories.

const TERMINAL_TASK_STATUSES = ['COMPLETED', 'CANCELLED', 'REJECTED'] as const

export type InactiveAssigneeCaseRef = { id: string; caseNumber: string; caseTitle: string; status: string }
export type InactiveAssigneeTaskRef = { id: string; title: string; status: string }

export type InactiveAssigneeGap = {
  employeeId: string
  employeeName: string
  employeeStatus: string
  cases: InactiveAssigneeCaseRef[]
  tasks: InactiveAssigneeTaskRef[]
}

export async function getInactiveAssigneeGaps(prisma: PrismaClient): Promise<{
  gaps: InactiveAssigneeGap[]
  gapCount: number
}> {
  const [cases, tasks] = await Promise.all([
    prisma.case.findMany({
      where: {
        closedAt: null,
        assignedEmployeeId: { not: null },
        assignedEmployee: { status: { not: 'ACTIVE' } },
      },
      select: {
        id: true, caseNumber: true, caseTitle: true, status: true,
        assignedEmployee: { select: { id: true, name: true, status: true } },
      },
    }),
    prisma.taskAssignment.findMany({
      where: {
        status: { notIn: [...TERMINAL_TASK_STATUSES] },
        assignee: { status: { not: 'ACTIVE' } },
      },
      select: {
        id: true, title: true, status: true,
        assignee: { select: { id: true, name: true, status: true } },
      },
    }),
  ])

  const byEmployee = new Map<string, InactiveAssigneeGap>()
  const entryFor = (id: string, name: string, status: string) => {
    let entry = byEmployee.get(id)
    if (!entry) {
      entry = { employeeId: id, employeeName: name, employeeStatus: status, cases: [], tasks: [] }
      byEmployee.set(id, entry)
    }
    return entry
  }

  for (const c of cases) {
    if (!c.assignedEmployee) continue
    entryFor(c.assignedEmployee.id, c.assignedEmployee.name, c.assignedEmployee.status).cases.push({
      id: c.id, caseNumber: c.caseNumber, caseTitle: c.caseTitle, status: c.status,
    })
  }
  for (const t of tasks) {
    entryFor(t.assignee.id, t.assignee.name, t.assignee.status).tasks.push({
      id: t.id, title: t.title, status: t.status,
    })
  }

  const gaps = [...byEmployee.values()].sort((a, b) => a.employeeName.localeCompare(b.employeeName))
  return { gaps, gapCount: gaps.length }
}
