import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'

export async function GET() {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const now           = new Date()
  const startOfMonth  = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth    = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  const [
    totalInvoices,
    statusCounts,
    monthRevenue,
    overdueList,
    recentInvoices,
    totalOutstanding,
  ] = await Promise.all([
    prisma.billingInvoice.count(),
    prisma.billingInvoice.groupBy({ by: ['status'], _count: { id: true }, _sum: { totalAmount: true } }),
    prisma.billingInvoice.aggregate({
      where:  { status: 'PAID', updatedAt: { gte: startOfMonth, lte: endOfMonth } },
      _sum:   { paidAmount: true },
      _count: { id: true },
    }),
    prisma.billingInvoice.findMany({
      where: {
        status: { notIn: ['PAID', 'CANCELLED', 'DRAFT'] },
        dueDate: { lt: now },
      },
      include: {
        clientCompany: { select: { companyName: true } },
      },
      orderBy: { dueDate: 'asc' },
      take: 20,
    }),
    prisma.billingInvoice.findMany({
      where:   { status: { notIn: ['CANCELLED'] } },
      include: { clientCompany: { select: { companyName: true } } },
      orderBy: { createdAt: 'desc' },
      take:    10,
    }),
    prisma.billingInvoice.aggregate({
      where: { status: { notIn: ['PAID', 'CANCELLED', 'DRAFT'] } },
      _sum:  { remainingAmount: true },
    }),
  ])

  const statusMap: Record<string, { count: number; total: number }> = {}
  for (const row of statusCounts) {
    statusMap[row.status] = { count: row._count.id, total: row._sum.totalAmount ?? 0 }
  }

  return NextResponse.json({
    totalInvoices,
    statusMap,
    monthRevenue:     monthRevenue._sum.paidAmount ?? 0,
    monthPaidCount:   monthRevenue._count.id,
    totalOutstanding: totalOutstanding._sum.remainingAmount ?? 0,
    overdueCount:     overdueList.length,
    overdueList,
    recentInvoices,
  })
 } catch (err) {
  return apiError(err)
 }
}
