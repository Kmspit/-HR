import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import type { CaseStatus } from '@prisma/client'
import { apiError } from '@/lib/api-handler'

const EXEC_ROLES    = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']
const MANAGER_ROLES = [...EXEC_ROLES, 'MANAGER', 'TEAM_LEADER']

export async function GET() {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { role, id: userId, department } = session.user
  const now  = new Date()
  const week = new Date(now.getTime() + 7 * 86400000)

  const activeStatuses: CaseStatus[] = [
    'NEW', 'ASSIGNED', 'INVESTIGATING', 'NEGOTIATING',
    'WAITING_DOCUMENT', 'FILED', 'COURT_PROCESS', 'ENFORCEMENT', 'SETTLED',
  ]

  const scopeWhere = EXEC_ROLES.includes(role)
    ? {}
    : role === 'MANAGER' && department
      ? { department }
      : { OR: [{ assignedEmployeeId: userId }, { createdById: userId }] }

  const [active, overdue, highRisk, courtSoon, myCases, teamCases] = await Promise.all([
    prisma.case.count({ where: { ...scopeWhere, status: { in: activeStatuses } } }),
    prisma.case.count({ where: { ...scopeWhere, status: { in: activeStatuses }, dueDate: { lt: now } } }),
    prisma.case.count({ where: { ...scopeWhere, status: { in: activeStatuses }, riskLevel: { in: ['HIGH', 'CRITICAL'] } } }),
    prisma.caseCourt.count({ where: { courtDate: { gte: now, lte: week }, case: { ...scopeWhere, status: { in: activeStatuses } } } }),

    // My assigned cases
    prisma.case.findMany({
      where: { assignedEmployeeId: userId, status: { in: activeStatuses } },
      select: { id: true, caseNumber: true, caseTitle: true, status: true, priority: true, riskLevel: true, dueDate: true, _count: { select: { tasks: true } } },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
      take: 20,
    }),

    // Team workload (cases per assignee in scope)
    prisma.case.groupBy({
      by: ['assignedEmployeeId'],
      where: { ...scopeWhere, status: { in: activeStatuses } },
      _count: { id: true },
    }),
  ])

  // Enrich team workload with names
  const assigneeIds = teamCases.map(t => t.assignedEmployeeId).filter(Boolean) as string[]
  const employees   = await prisma.user.findMany({
    where: { id: { in: assigneeIds } },
    select: { id: true, name: true, department: true },
  })
  const empMap = Object.fromEntries(employees.map(e => [e.id, e]))

  const workload = teamCases.map(t => ({
    employeeId:   t.assignedEmployeeId,
    employeeName: empMap[t.assignedEmployeeId ?? '']?.name ?? 'ไม่ระบุ',
    department:   empMap[t.assignedEmployeeId ?? '']?.department ?? null,
    caseCount:    t._count.id,
  })).sort((a, b) => b.caseCount - a.caseCount)

  return NextResponse.json({
    summary: { active, overdue, highRisk, courtSoon },
    myCases,
    workload,
  })
} catch (err) {
  return apiError(err)
 }
}
