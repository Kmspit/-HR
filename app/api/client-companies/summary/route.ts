import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const now    = new Date()
  const d7     = new Date(now.getTime() +  7 * 86400_000)
  const d30    = new Date(now.getTime() + 30 * 86400_000)
  const d60    = new Date(now.getTime() + 60 * 86400_000)
  const d90    = new Date(now.getTime() + 90 * 86400_000)

  const [
    totalCompanies,
    byStatus,
    expiring7,
    expiring30,
    expiring60,
    expiring90,
    totalContractValue,
    topByTaskCount,
    slaStats,
  ] = await Promise.all([
    prisma.clientCompany.count(),
    prisma.clientCompany.groupBy({ by: ['status'], _count: { id: true } }),
    prisma.clientContract.count({ where: { endDate: { lte: d7,  gte: now }, status: 'ACTIVE' } }),
    prisma.clientContract.count({ where: { endDate: { lte: d30, gte: now }, status: 'ACTIVE' } }),
    prisma.clientContract.count({ where: { endDate: { lte: d60, gte: now }, status: 'ACTIVE' } }),
    prisma.clientContract.count({ where: { endDate: { lte: d90, gte: now }, status: 'ACTIVE' } }),
    prisma.clientContract.aggregate({ where: { status: 'ACTIVE' }, _sum: { value: true } }),
    prisma.clientCompany.findMany({
      include: {
        _count:    { select: { tasks: true, contracts: true } },
        contracts: { where: { status: 'ACTIVE' }, select: { value: true } },
      },
      orderBy:   { updatedAt: 'desc' },
      take:      20,
    }),
    prisma.clientSlaRecord.groupBy({
      by:    ['met'],
      _count: { id: true },
      where:  { met: { not: null } },
    }),
  ])

  // Compute per-company revenue for top 10
  const topRevenue = topByTaskCount
    .map((c) => ({
      id:          c.id,
      clientCode:  c.clientCode,
      companyName: c.companyName,
      status:      c.status,
      taskCount:   c._count.tasks,
      contractValue: c.contracts.reduce((s, ct) => s + ct.value, 0),
    }))
    .sort((a, b) => b.contractValue - a.contractValue)
    .slice(0, 10)

  const expiringContracts = await prisma.clientContract.findMany({
    where:   { endDate: { lte: d90, gte: now }, status: 'ACTIVE' },
    include: { clientCompany: { select: { id: true, clientCode: true, companyName: true } } },
    orderBy: { endDate: 'asc' },
    take:    20,
  })

  const slaMetCount    = slaStats.find((s) => s.met === true)?._count.id  ?? 0
  const slaMissedCount = slaStats.find((s) => s.met === false)?._count.id ?? 0
  const slaTotal       = slaMetCount + slaMissedCount
  const slaRate        = slaTotal > 0 ? (slaMetCount / slaTotal) * 100 : null

  const statusMap: Record<string, number> = {}
  for (const r of byStatus) statusMap[r.status] = r._count.id

  return NextResponse.json({
    totalCompanies,
    statusMap,
    totalContractValue: totalContractValue._sum.value ?? 0,
    expiring7, expiring30, expiring60, expiring90,
    topRevenue,
    expiringContracts,
    sla: { met: slaMetCount, missed: slaMissedCount, total: slaTotal, rate: slaRate },
  })
}
