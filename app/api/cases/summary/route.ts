import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import type { CaseStatus, CasePriority } from '@prisma/client'
import { apiError } from '@/lib/api-handler'

const EXEC_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

export async function GET() {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, id: userId, department } = session.user

  type WhereClause = Record<string, unknown>
  let baseWhere: WhereClause = {}
  if (!EXEC_ROLES.includes(role)) {
    if (role === 'MANAGER' && department) {
      baseWhere = { department }
    } else {
      baseWhere = { OR: [{ assignedEmployeeId: userId }, { createdById: userId }] }
    }
  }

  const now = new Date()
  const activeStatuses: CaseStatus[] = ['NEW', 'ASSIGNED', 'INVESTIGATING', 'NEGOTIATING', 'WAITING_DOCUMENT', 'FILED', 'COURT_PROCESS', 'ENFORCEMENT', 'SETTLED']
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [active, overdueCount, highRisk, courtThisWeekCount] = await Promise.all([
    prisma.case.count({
      where: { ...baseWhere, status: { in: activeStatuses } },
    }),
    prisma.case.count({
      where: {
        ...baseWhere,
        dueDate: { lt: now },
        status:  { in: activeStatuses },
      },
    }),
    prisma.case.count({
      where: {
        ...baseWhere,
        priority: { in: ['HIGH', 'CRITICAL'] as CasePriority[] },
        status:   { in: activeStatuses },
      },
    }),
    prisma.caseCourt.count({
      where: {
        courtDate: { gte: now, lte: weekEnd },
        case:      { ...baseWhere, status: { in: activeStatuses } },
      },
    }),
  ])

  return NextResponse.json({ active, overdueCount, highRisk, courtThisWeekCount })
} catch (err) {
  return apiError(err)
 }
}
