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
  if (!EXEC_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const now    = new Date()
  const week7  = new Date(now.getTime() + 7 * 86400000)
  const month1 = new Date(now.getTime() - 30 * 86400000)

  const activeStatuses: CaseStatus[] = [
    'NEW', 'ASSIGNED', 'INVESTIGATING', 'NEGOTIATING',
    'WAITING_DOCUMENT', 'FILED', 'COURT_PROCESS', 'ENFORCEMENT', 'SETTLED',
  ]

  const [
    totalActive, totalCompleted, totalOverdue, totalHighRisk,
    byType, byDept, byRisk, courtThisWeek,
    recentCompleted, financialAgg,
  ] = await Promise.all([
    prisma.case.count({ where: { status: { in: activeStatuses } } }),
    prisma.case.count({ where: { status: 'COMPLETED' } }),
    prisma.case.count({ where: { status: { in: activeStatuses }, dueDate: { lt: now } } }),
    prisma.case.count({ where: { status: { in: activeStatuses }, priority: { in: ['HIGH', 'CRITICAL'] as CasePriority[] } } }),

    prisma.case.groupBy({ by: ['caseType'], _count: { id: true }, orderBy: { _count: { id: 'desc' } } }),
    prisma.case.groupBy({ by: ['department'], where: { status: { in: activeStatuses } }, _count: { id: true }, orderBy: { _count: { id: 'desc' } } }),
    prisma.case.groupBy({ by: ['riskLevel'], where: { status: { in: activeStatuses } }, _count: { id: true } }),

    prisma.caseCourt.count({ where: { courtDate: { gte: now, lte: week7 }, case: { status: { in: activeStatuses } } } }),

    prisma.case.findMany({
      where: { status: 'COMPLETED', closedAt: { gte: month1 } },
      select: { id: true, caseNumber: true, caseTitle: true, debtAmount: true, collectedAmount: true, closedAt: true, caseType: true },
      orderBy: { closedAt: 'desc' },
      take: 10,
    }),

    prisma.caseFinancial.aggregate({
      _sum: { debtAmount: true, collectedAmount: true, legalFee: true, courtFee: true, enforcementFee: true },
    }),
  ])

  const totalDebt      = financialAgg._sum.debtAmount      ?? 0
  const totalCollected = financialAgg._sum.collectedAmount  ?? 0
  const recoveryRate   = totalDebt > 0 ? Math.round((totalCollected / totalDebt) * 100) : 0

  return NextResponse.json({
    summary: {
      totalActive, totalCompleted, totalOverdue, totalHighRisk,
      courtThisWeek, recoveryRate, totalDebt, totalCollected,
    },
    byType:   byType.map(r => ({ type: r.caseType, count: r._count.id })),
    byDept:   byDept.map(r => ({ dept: r.department ?? 'ไม่ระบุ', count: r._count.id })),
    byRisk:   byRisk.map(r => ({ risk: r.riskLevel, count: r._count.id })),
    recentCompleted,
  })
} catch (err) {
  return apiError(err)
 }
}
