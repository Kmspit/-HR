import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import type { CaseStatus } from '@prisma/client'
import { canAccessExecutiveApi } from '@/lib/executive-api'
import { apiError } from '@/lib/api-handler'

const ACTIVE_STATUSES: CaseStatus[] = [
  'NEW', 'ASSIGNED', 'INVESTIGATING', 'NEGOTIATING',
  'WAITING_DOCUMENT', 'FILED', 'COURT_PROCESS', 'ENFORCEMENT', 'SETTLED',
]

export async function GET(req: NextRequest) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessExecutiveApi(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const section = req.nextUrl.searchParams.get('section') ?? 'all'
  const now        = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const last30     = new Date(now.getTime() - 30 * 86_400_000)
  const last90     = new Date(now.getTime() - 90 * 86_400_000)

  const result: Record<string, unknown> = {}

  // ── LEGAL ──────────────────────────────────────────────────────────────────
  if (section === 'all' || section === 'legal') {
    const [
      caseByStatus,
      caseByType,
      courtByStatus,
      completedCourts30d,
      successfulCourts30d,
      upcomingCritical,
      lawyerWorkload,
    ] = await Promise.all([
      prisma.case.groupBy({ by: ['status'], _count: { id: true } }),
      prisma.case.groupBy({ by: ['caseType'], where: { status: { in: ACTIVE_STATUSES } }, _count: { id: true } }),
      prisma.courtEvent.groupBy({ by: ['status'], where: { appointmentDate: { gte: last30 } }, _count: { id: true } }),
      prisma.courtEvent.count({ where: { appointmentDate: { gte: last30 }, status: { in: ['COMPLETED', 'MISSED'] } } }),
      prisma.courtEvent.count({ where: { appointmentDate: { gte: last30 }, status: 'COMPLETED' } }),
      prisma.courtEvent.findMany({
        where: { status: { in: ['SCHEDULED', 'CONFIRMED'] }, priority: { in: ['HIGH', 'CRITICAL'] }, appointmentDate: { gte: now } },
        include: { case: { select: { caseNumber: true, caseTitle: true } }, assignedLawyer: { select: { name: true } } },
        orderBy: [{ priority: 'asc' }, { appointmentDate: 'asc' }],
        take: 10,
      }),
      prisma.courtEvent.groupBy({
        by: ['assignedLawyerId'],
        where: { status: { in: ['SCHEDULED', 'CONFIRMED'] }, appointmentDate: { gte: now } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
    ])

    const courtSuccessRate = completedCourts30d > 0 ? Math.round((successfulCourts30d / completedCourts30d) * 100) : 0

    const lawyerIds = lawyerWorkload.map(r => r.assignedLawyerId).filter(Boolean) as string[]
    const lawyers = lawyerIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: lawyerIds } }, select: { id: true, name: true } })
      : []
    const lawyerMap = Object.fromEntries(lawyers.map(l => [l.id, l.name]))

    result.legal = {
      caseByStatus:     caseByStatus.map(r => ({ status: r.status, count: r._count.id })),
      caseByType:       caseByType.map(r => ({ type: r.caseType, count: r._count.id })),
      courtByStatus:    courtByStatus.map(r => ({ status: r.status, count: r._count.id })),
      courtSuccessRate,
      upcomingCritical,
      lawyerWorkload:   lawyerWorkload.map(r => ({
        lawyerId:   r.assignedLawyerId,
        lawyerName: r.assignedLawyerId ? (lawyerMap[r.assignedLawyerId] ?? 'Unknown') : 'ไม่ระบุ',
        upcoming:   r._count.id,
      })),
    }
  }

  // ── RECOVERY ───────────────────────────────────────────────────────────────
  if (section === 'all' || section === 'recovery') {
    const [
      dailyRecovery,
      promiseStats,
      topDebtors,
      collectorRanking,
      expectedCashflow,
    ] = await Promise.all([
      // Daily recovery last 30 days
      prisma.recoveryPayment.groupBy({
        by: ['paymentDate'],
        where: { status: 'CONFIRMED', paymentDate: { gte: last30 } },
        _sum: { amount: true },
        _count: { id: true },
        orderBy: { paymentDate: 'asc' },
        take: 30,
      }),
      // Promise stats
      prisma.promiseToPay.groupBy({
        by: ['status'],
        where: { createdAt: { gte: last90 } },
        _count: { id: true },
        _sum: { promisedAmount: true },
      }),
      // Top paying debtors
      prisma.recoveryPayment.groupBy({
        by: ['debtorId'],
        where: { status: 'CONFIRMED', paymentDate: { gte: last90 } },
        _sum: { amount: true },
        _count: { id: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 5,
      }),
      // Collector ranking
      prisma.recoveryPayment.groupBy({
        by: ['collectorId'],
        where: { status: 'CONFIRMED', paymentDate: { gte: monthStart } },
        _sum: { amount: true },
        _count: { id: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 10,
      }),
      // Expected cashflow (pending promises)
      prisma.promiseToPay.aggregate({
        where: { status: 'PENDING', promisedDate: { gte: now } },
        _sum: { promisedAmount: true },
        _count: { id: true },
      }),
    ])

    // Resolve debtor names
    const debtorIds  = topDebtors.map(r => r.debtorId)
    const debtors    = debtorIds.length > 0
      ? await prisma.debtor.findMany({ where: { id: { in: debtorIds } }, select: { id: true, firstName: true, lastName: true, debtorNumber: true } })
      : []
    const debtorMap  = Object.fromEntries(debtors.map(d => [d.id, d]))

    // Resolve collector names
    const collectorIds = collectorRanking.map(r => r.collectorId)
    const collectors   = collectorIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: collectorIds } }, select: { id: true, name: true } })
      : []
    const collectorMap = Object.fromEntries(collectors.map(c => [c.id, c.name]))

    result.recovery = {
      dailyTrend:    dailyRecovery.map(r => ({ date: r.paymentDate, amount: r._sum.amount ?? 0, count: r._count.id })),
      promiseStats:  promiseStats.map(r => ({ status: r.status, count: r._count.id, amount: r._sum.promisedAmount ?? 0 })),
      topDebtors:    topDebtors.map(r => ({ ...debtorMap[r.debtorId], paid: r._sum.amount ?? 0, times: r._count.id })),
      collectorRank: collectorRanking.map(r => ({ collectorId: r.collectorId, name: collectorMap[r.collectorId] ?? 'Unknown', amount: r._sum.amount ?? 0, count: r._count.id })),
      expectedCashflow: { amount: expectedCashflow._sum.promisedAmount ?? 0, count: expectedCashflow._count },
    }
  }

  // ── CRM ────────────────────────────────────────────────────────────────────
  if (section === 'all' || section === 'crm') {
    const [
      contactStats,
      debtorByRisk,
      noContactDebtors,
      promiseTrend,
    ] = await Promise.all([
      prisma.debtorContact.groupBy({
        by: ['result'],
        where: { createdAt: { gte: last30 } },
        _count: { id: true },
      }),
      prisma.debtor.groupBy({
        by: ['riskLevel'],
        where: { status: { notIn: ['COMPLETED', 'CLOSED', 'CANCELLED'] } },
        _count: { id: true },
        _sum: { remainingDebt: true },
      }),
      prisma.debtor.findMany({
        where: {
          status: { notIn: ['COMPLETED', 'CLOSED', 'CANCELLED'] },
          OR: [
            { lastContactAt: { lt: new Date(now.getTime() - 7 * 86_400_000) } },
            { lastContactAt: null },
          ],
        },
        select: { id: true, debtorNumber: true, firstName: true, lastName: true, remainingDebt: true, riskLevel: true, lastContactAt: true, assignedTo: { select: { name: true } } },
        orderBy: { remainingDebt: 'desc' },
        take: 10,
      }),
      prisma.promiseToPay.groupBy({
        by: ['status'],
        where: { createdAt: { gte: last30 } },
        _count: { id: true },
        _sum: { promisedAmount: true },
      }),
    ])

    const totalContacts = contactStats.reduce((s, r) => s + r._count.id, 0)
    const reachedContacts = contactStats.find(r => r.result === 'REACHED')?._count.id ?? 0
    const contactSuccessRate = totalContacts > 0 ? Math.round((reachedContacts / totalContacts) * 100) : 0

    result.crm = {
      contactStats: contactStats.map(r => ({ result: r.result, count: r._count.id })),
      contactSuccessRate,
      debtorByRisk: debtorByRisk.map(r => ({ risk: r.riskLevel, count: r._count.id, debt: r._sum.remainingDebt ?? 0 })),
      noContactDebtors,
      promiseTrend: promiseTrend.map(r => ({ status: r.status, count: r._count.id, amount: r._sum.promisedAmount ?? 0 })),
    }
  }

  // ── AUTOMATION ─────────────────────────────────────────────────────────────
  if (section === 'all' || section === 'automation') {
    const [
      ruleStats,
      topRules,
      failedRules,
      recentExecutions,
    ] = await Promise.all([
      prisma.automationRule.aggregate({
        _count: { id: true },
        _sum: { runCount: true, successCount: true, failCount: true },
      }),
      prisma.automationRule.findMany({
        where: { isActive: true },
        orderBy: { runCount: 'desc' },
        take: 5,
        select: { id: true, name: true, trigger: true, runCount: true, successCount: true, failCount: true },
      }),
      prisma.automationRule.findMany({
        where: { failCount: { gt: 0 } },
        orderBy: { failCount: 'desc' },
        take: 5,
        select: { id: true, name: true, trigger: true, failCount: true, runCount: true },
      }),
      prisma.automationExecutionLog.findMany({
        where: { triggeredAt: { gte: last30 }, testMode: false },
        select: { ruleId: true, success: true, durationMs: true, actionsRun: true, triggeredAt: true },
        orderBy: { triggeredAt: 'desc' },
        take: 100,
      }),
    ])

    const totalRuns      = ruleStats._sum.runCount    ?? 0
    const successRuns    = ruleStats._sum.successCount ?? 0
    const failRuns       = ruleStats._sum.failCount    ?? 0
    const successRate    = totalRuns > 0 ? Math.round((successRuns / totalRuns) * 100) : 0

    // Estimate time saved: each automation ~5 min saved
    const tasksAutoCreated     = recentExecutions.filter(e => e.actionsRun.includes('CREATE_TASK')).length
    const notificationsAutoSent = recentExecutions.filter(e => e.actionsRun.includes('SEND_NOTIFICATION') || e.actionsRun.includes('SEND_LINE')).length
    const minutesSaved         = (tasksAutoCreated + notificationsAutoSent) * 5

    result.automation = {
      totalRules:    ruleStats._count.id,
      totalRuns,
      successRuns,
      failRuns,
      successRate,
      topRules,
      failedRules,
      manualWorkReduced: { tasksAutoCreated, notificationsAutoSent, minutesSaved },
    }
  }

  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
      'Vary': 'Cookie',
    },
  })
} catch (err) {
  return apiError(err)
 }
}
