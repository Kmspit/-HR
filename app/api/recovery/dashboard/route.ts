import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'

const CAN_VIEW = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']

export async function GET() {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!CAN_VIEW.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const now    = new Date()
  const todayStart   = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart    = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000)
  const monthStart   = new Date(now.getFullYear(), now.getMonth(), 1)
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)

  const confirmed = { status: 'CONFIRMED' }

  const [
    todayTotal,
    weekTotal,
    monthTotal,
    prevMonthTotal,
    allTimeTotal,
    totalCount,
    pendingCount,
    confirmedCount,
    rejectedCount,
    byType,
    byMethod,
    collectorStats,
    recentPayments,
    topDebtors,
    overduePending,
  ] = await Promise.all([
    // Money recovered
    prisma.recoveryPayment.aggregate({ where: { ...confirmed, paymentDate: { gte: todayStart } }, _sum: { amount: true } }),
    prisma.recoveryPayment.aggregate({ where: { ...confirmed, paymentDate: { gte: weekStart } },  _sum: { amount: true } }),
    prisma.recoveryPayment.aggregate({ where: { ...confirmed, paymentDate: { gte: monthStart } }, _sum: { amount: true } }),
    prisma.recoveryPayment.aggregate({ where: { ...confirmed, paymentDate: { gte: prevMonthStart, lte: prevMonthEnd } }, _sum: { amount: true } }),
    prisma.recoveryPayment.aggregate({ where: confirmed, _sum: { amount: true } }),

    // Count stats
    prisma.recoveryPayment.count(),
    prisma.recoveryPayment.count({ where: { status: 'PENDING' } }),
    prisma.recoveryPayment.count({ where: { status: 'CONFIRMED' } }),
    prisma.recoveryPayment.count({ where: { status: 'REJECTED' } }),

    // Breakdown
    prisma.recoveryPayment.groupBy({ by: ['paymentType'], where: confirmed, _sum: { amount: true }, _count: true }),
    prisma.recoveryPayment.groupBy({ by: ['paymentMethod'], where: confirmed, _sum: { amount: true }, _count: true }),

    // Collector leaderboard (this month)
    prisma.recoveryPayment.groupBy({
      by: ['collectorId'],
      where: { ...confirmed, paymentDate: { gte: monthStart } },
      _sum: { amount: true },
      _count: true,
      orderBy: { _sum: { amount: 'desc' } },
      take: 10,
    }),

    // Recent payments
    prisma.recoveryPayment.findMany({
      where: {},
      include: {
        debtor:    { select: { id: true, firstName: true, lastName: true, debtorNumber: true } },
        collector: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 15,
    }),

    // Top paying debtors this month
    prisma.recoveryPayment.groupBy({
      by: ['debtorId'],
      where: { ...confirmed, paymentDate: { gte: monthStart } },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 5,
    }),

    // Promise overdue not paid (smart alert)
    prisma.promiseToPay.findMany({
      where: {
        status: 'PENDING',
        promisedDate: { lt: now },
      },
      include: {
        debtor: { select: { id: true, firstName: true, lastName: true, debtorNumber: true, assignedToId: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { promisedDate: 'asc' },
      take: 10,
    }),
  ])

  // Enrich collector leaderboard with user names
  const collectorIds = collectorStats.map(c => c.collectorId)
  const collectorUsers = await prisma.user.findMany({
    where: { id: { in: collectorIds } },
    select: { id: true, name: true, department: true },
  })
  const userMap = Object.fromEntries(collectorUsers.map(u => [u.id, u]))

  // Enrich top debtors
  const topDebtorIds = topDebtors.map(d => d.debtorId)
  const topDebtorUsers = await prisma.debtor.findMany({
    where: { id: { in: topDebtorIds } },
    select: { id: true, firstName: true, lastName: true, debtorNumber: true, remainingDebt: true },
  })
  const debtorMap = Object.fromEntries(topDebtorUsers.map(d => [d.id, d]))

  const prevMonthAmt  = prevMonthTotal._sum.amount ?? 0
  const thisMonthAmt  = monthTotal._sum.amount ?? 0
  const monthGrowth   = prevMonthAmt > 0 ? ((thisMonthAmt - prevMonthAmt) / prevMonthAmt) * 100 : null

  return NextResponse.json({
    kpi: {
      today:     todayTotal._sum.amount   ?? 0,
      week:      weekTotal._sum.amount    ?? 0,
      month:     thisMonthAmt,
      prevMonth: prevMonthAmt,
      allTime:   allTimeTotal._sum.amount ?? 0,
      monthGrowth,
    },
    counts: { total: totalCount, pending: pendingCount, confirmed: confirmedCount, rejected: rejectedCount },
    byType:   byType.map(t => ({ type: t.paymentType, amount: t._sum.amount ?? 0, count: t._count })),
    byMethod: byMethod.map(m => ({ method: m.paymentMethod, amount: m._sum.amount ?? 0, count: m._count })),
    leaderboard: collectorStats.map(c => ({
      collectorId: c.collectorId,
      name:       userMap[c.collectorId]?.name       ?? 'Unknown',
      department: userMap[c.collectorId]?.department ?? '—',
      amount:     c._sum.amount ?? 0,
      count:      c._count,
    })),
    recentPayments,
    topDebtors: topDebtors.map(d => ({
      debtorId: d.debtorId,
      ...debtorMap[d.debtorId],
      paidThisMonth: d._sum.amount ?? 0,
    })),
    alerts: {
      overduePromises: overduePending.map(p => ({
        id:          p.id,
        debtorId:    p.debtorId,
        debtorName:  `${p.debtor.firstName} ${p.debtor.lastName}`,
        debtorNumber: p.debtor.debtorNumber,
        promisedAmount: p.promisedAmount,
        promisedDate:   p.promisedDate,
        daysOverdue: Math.floor((now.getTime() - new Date(p.promisedDate).getTime()) / (24 * 60 * 60 * 1000)),
      })),
    },
  })
} catch (err) {
  return apiError(err)
 }
}
