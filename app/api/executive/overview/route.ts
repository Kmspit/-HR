import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import type { CaseStatus, CasePriority } from '@prisma/client'
import { canAccessExecutiveApi } from '@/lib/executive-api'
import { apiError } from '@/lib/api-handler'

const ACTIVE_CASE_STATUSES: CaseStatus[] = [
  'NEW', 'ASSIGNED', 'INVESTIGATING', 'NEGOTIATING',
  'WAITING_DOCUMENT', 'FILED', 'COURT_PROCESS', 'ENFORCEMENT', 'SETTLED',
]

export async function GET() {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessExecutiveApi(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const now           = new Date()
  const todayStart    = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd      = new Date(todayStart.getTime() + 86_400_000 - 1)
  const weekEnd       = new Date(todayStart.getTime() + 7 * 86_400_000 - 1)
  const monthStart    = new Date(now.getFullYear(), now.getMonth(), 1)
  const last30        = new Date(now.getTime() - 30 * 86_400_000)
  const last7         = new Date(now.getTime() - 7 * 86_400_000)

  const caseBase = { status: { in: ACTIVE_CASE_STATUSES } }

  const [
    activeCases,
    casesThisMonth,
    highRiskCases,
    criticalCases,
    criticalDebtors,
    hearingsToday,
    hearingsThisWeek,
    missedCourts30d,
    totalCourts30d,
    overdueTasks,
    recoveryTodayAgg,
    recoveryMonthAgg,
    financialAgg,
    promiseKeptCount,
    promiseBrokenCount,
    lateToday,
    warningsThisMonth,
    noContactDebtors,
    slaOverdue,
    brokenPromises30d,
  ] = await Promise.all([
    prisma.case.count({ where: caseBase }),
    prisma.case.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.case.count({ where: { ...caseBase, riskLevel: { in: ['HIGH', 'CRITICAL'] } } }),
    prisma.case.count({ where: { ...caseBase, priority: 'CRITICAL' as CasePriority } }),

    prisma.debtor.count({ where: { riskLevel: 'CRITICAL', status: { notIn: ['COMPLETED', 'CLOSED'] } } }),

    prisma.courtEvent.count({ where: { appointmentDate: { gte: todayStart, lte: todayEnd }, status: { in: ['SCHEDULED', 'CONFIRMED'] } } }),
    prisma.courtEvent.count({ where: { appointmentDate: { gte: todayStart, lte: weekEnd }, status: { in: ['SCHEDULED', 'CONFIRMED'] } } }),
    prisma.courtEvent.count({ where: { appointmentDate: { gte: last30 }, status: 'MISSED' } }),
    prisma.courtEvent.count({ where: { appointmentDate: { gte: last30 } } }),

    prisma.taskAssignment.count({
      where: {
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
        dueDate: { lt: now },
      },
    }),

    prisma.recoveryPayment.aggregate({
      where: { paymentDate: { gte: todayStart, lte: todayEnd }, status: 'CONFIRMED' },
      _sum: { amount: true },
    }),
    prisma.recoveryPayment.aggregate({
      where: { paymentDate: { gte: monthStart }, status: 'CONFIRMED' },
      _sum: { amount: true },
    }),

    prisma.caseFinancial.aggregate({
      _sum: { debtAmount: true, collectedAmount: true },
    }),

    prisma.promiseToPay.count({ where: { status: 'KEPT', createdAt: { gte: last30 } } }),
    prisma.promiseToPay.count({ where: { status: 'BROKEN', createdAt: { gte: last30 } } }),

    prisma.attendance.count({ where: { date: { gte: todayStart, lte: todayEnd }, lateMinutes: { gt: 0 } } }),
    prisma.warning.count({ where: { createdAt: { gte: monthStart } } }),

    prisma.debtor.count({
      where: {
        status: { notIn: ['COMPLETED', 'CLOSED', 'CANCELLED'] },
        OR: [
          { lastContactAt: { lt: last7 } },
          { lastContactAt: null },
        ],
      },
    }),

    prisma.case.count({
      where: {
        status: { in: ACTIVE_CASE_STATUSES },
        slaDeadline: { lt: now },
      },
    }),

    prisma.promiseToPay.findMany({
      where: { status: 'BROKEN', updatedAt: { gte: last30 } },
      include: { debtor: { select: { firstName: true, lastName: true, debtorNumber: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
  ])

  const totalDebt      = financialAgg._sum.debtAmount     ?? 0
  const totalCollected = financialAgg._sum.collectedAmount ?? 0
  const collectionRate = totalDebt > 0 ? Math.round((totalCollected / totalDebt) * 100) : 0

  const promiseTotal    = promiseKeptCount + promiseBrokenCount
  const promiseKeptPct  = promiseTotal > 0 ? Math.round((promiseKeptCount / promiseTotal) * 100) : 0

  const missedHearingPct = totalCourts30d > 0 ? Math.round((missedCourts30d / totalCourts30d) * 100) : 0

  // Risk items for critical cases
  const criticalCaseList = await prisma.case.findMany({
    where: { priority: 'CRITICAL' as CasePriority, status: { in: ACTIVE_CASE_STATUSES } },
    select: { id: true, caseNumber: true, caseTitle: true, riskLevel: true, priority: true, slaDeadline: true, assignedEmployee: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })

  const recentMissedHearings = await prisma.courtEvent.findMany({
    where: { status: 'MISSED', appointmentDate: { gte: last30 } },
    include: { case: { select: { caseNumber: true, caseTitle: true } }, assignedLawyer: { select: { name: true } } },
    orderBy: { appointmentDate: 'desc' },
    take: 5,
  })

  const highDebtDebtors = await prisma.debtor.findMany({
    where: { remainingDebt: { gt: 100000 }, status: { notIn: ['COMPLETED', 'CLOSED'] } },
    select: { id: true, debtorNumber: true, firstName: true, lastName: true, remainingDebt: true, riskLevel: true, lastContactAt: true },
    orderBy: { remainingDebt: 'desc' },
    take: 5,
  })

  return NextResponse.json({
    kpi: {
      activeCases,
      casesThisMonth,
      highRiskCases,
      criticalCases,
      criticalDebtors,
      hearingsToday,
      hearingsThisWeek,
      recoveryToday:    recoveryTodayAgg._sum.amount  ?? 0,
      recoveryThisMonth: recoveryMonthAgg._sum.amount ?? 0,
      totalDebt,
      totalCollected,
      collectionRate,
      promiseKeptPct,
      overdueTasks,
      missedHearingPct,
      lateToday,
      warningsThisMonth,
      noContactDebtors,
      slaOverdue,
    },
    risk: {
      criticalCases:     criticalCaseList,
      missedHearings:    recentMissedHearings,
      highDebtDebtors,
      brokenPromises:    brokenPromises30d,
      noContactCount:    noContactDebtors,
      slaOverdueCount:   slaOverdue,
    },
  }, {
    headers: {
      'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
      'Vary': 'Cookie',
    },
  })
} catch (err) {
  return apiError(err)
 }
}
