import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'

export async function GET() {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = session.user.role
  if (!['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const now      = new Date()
  const month1st = new Date(now.getFullYear(), now.getMonth(), 1)

  const [
    totalDebtors,
    byStatus,
    totalDebtAgg,
    paidAgg,
    remainingAgg,
    monthPayments,
    upcomingAppts,
    overdueAppts,
    topRemaining,
  ] = await Promise.all([
    prisma.debtor.count({ where: { deletedAt: null } }),
    prisma.debtor.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { id: true } }),
    prisma.debtor.aggregate({ where: { deletedAt: null }, _sum: { totalDebt: true } }),
    prisma.debtor.aggregate({ where: { deletedAt: null }, _sum: { paidAmount: true } }),
    prisma.debtor.aggregate({ where: { deletedAt: null }, _sum: { remainingDebt: true } }),
    prisma.debtPayment.aggregate({
      where: { paidAt: { gte: month1st }, debtor: { deletedAt: null } },
      _sum: { amount: true },
    }),
    prisma.paymentAppointment.count({
      where: { appointDate: { gte: now }, status: 'PENDING', debtor: { deletedAt: null } },
    }),
    prisma.paymentAppointment.count({
      where: { appointDate: { lt: now }, status: 'PENDING', debtor: { deletedAt: null } },
    }),
    prisma.debtor.findMany({
      where:   { remainingDebt: { gt: 0 }, deletedAt: null },
      orderBy: { remainingDebt: 'desc' },
      take:    10,
      select:  { id: true, debtorNumber: true, firstName: true, lastName: true, status: true, totalDebt: true, remainingDebt: true, assignedTo: { select: { name: true } } },
    }),
  ])

  const statusMap: Record<string, number> = {}
  for (const r of byStatus) statusMap[r.status] = r._count.id

  return NextResponse.json({
    totalDebtors,
    statusMap,
    totalDebt:       totalDebtAgg._sum.totalDebt   ?? 0,
    paidAmount:      paidAgg._sum.paidAmount        ?? 0,
    remainingDebt:   remainingAgg._sum.remainingDebt ?? 0,
    monthCollected:  monthPayments._sum.amount      ?? 0,
    upcomingAppts,
    overdueAppts,
    recoveryRate:    totalDebtAgg._sum.totalDebt
      ? ((paidAgg._sum.paidAmount ?? 0) / totalDebtAgg._sum.totalDebt) * 100
      : 0,
    topRemaining,
  })
} catch (err) {
  return apiError(err)
 }
}
