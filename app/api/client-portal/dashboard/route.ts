import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { requireActivePortalSession } from '@/lib/portal-session-guard'

const ACTIVE_STATUSES = [
  'NEW', 'ASSIGNED', 'INVESTIGATING', 'NEGOTIATING',
  'WAITING_DOCUMENT', 'FILED', 'COURT_PROCESS', 'ENFORCEMENT',
] as const

const COMPLETED_STATUSES = ['SETTLED', 'COMPLETED'] as const

export async function GET(req: NextRequest) {
  const portal = await requireActivePortalSession(req)
  if (!portal.ok) {
    return NextResponse.json({ error: portal.error }, { status: portal.status })
  }
  const session = portal.session
  const { clientCompanyId } = session

  const caseLinks = await prisma.caseClient.findMany({
    where:  { clientCompanyId },
    select: { caseId: true },
  })
  const caseIds = caseLinks.map((l) => l.caseId)

  if (caseIds.length === 0) {
    return NextResponse.json({
      activeCases:      0,
      completedCases:   0,
      totalRecovery:    0,
      collectionRate:   0,
      upcomingHearings: 0,
      recentPayments:   [],
      highRiskDebtors:  0,
    })
  }

  const now   = new Date()
  const next7 = new Date(now.getTime() + 7 * 86400_000)
  const past30 = new Date(now.getTime() - 30 * 86400_000)

  const [
    activeCases,
    completedCases,
    recoveryAgg,
    debtAgg,
    upcomingHearings,
    recentPayments,
    highRiskDebtors,
  ] = await Promise.all([
    prisma.case.count({
      where: { id: { in: caseIds }, status: { in: ACTIVE_STATUSES as unknown as never } },
    }),
    prisma.case.count({
      where: { id: { in: caseIds }, status: { in: COMPLETED_STATUSES as unknown as never } },
    }),
    prisma.recoveryPayment.aggregate({
      where: { caseId: { in: caseIds }, status: 'RECEIVED' },
      _sum:  { amount: true },
    }),
    prisma.case.aggregate({
      where: { id: { in: caseIds } },
      _sum:  { debtAmount: true },
    }),
    prisma.courtEvent.count({
      where: {
        caseId:          { in: caseIds },
        appointmentDate: { gte: now, lte: next7 },
        status:          { in: ['SCHEDULED', 'CONFIRMED'] },
      },
    }),
    prisma.recoveryPayment.findMany({
      where:   { caseId: { in: caseIds }, paymentDate: { gte: past30 } },
      orderBy: { paymentDate: 'desc' },
      take:    10,
      select: {
        id:          true,
        amount:      true,
        paymentDate: true,
        status:      true,
        case:        { select: { caseNumber: true, caseTitle: true } },
      },
    }),
    prisma.caseDebtor.count({
      where: { caseId: { in: caseIds }, riskLevel: 'HIGH' },
    }),
  ])

  const totalRecovery  = recoveryAgg._sum.amount ?? 0
  const totalDebt      = debtAgg._sum.debtAmount ?? 0
  const collectionRate = totalDebt > 0 ? Math.round((totalRecovery / totalDebt) * 100) : 0

  void prisma.clientPortalLog.create({
    data: {
      portalUserId: session.portalUserId,
      action:       'VIEW_DASHBOARD',
      ipAddress:    req.headers.get('x-forwarded-for') ?? undefined,
    },
  }).catch(() => undefined)

  return NextResponse.json({
    activeCases,
    completedCases,
    totalRecovery,
    collectionRate,
    upcomingHearings,
    recentPayments: recentPayments.map((p) => ({
      ...p,
      case: p.case ? { caseNumber: p.case.caseNumber, title: p.case.caseTitle } : null,
    })),
    highRiskDebtors,
  })
}
