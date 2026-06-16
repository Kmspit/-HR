import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const CAN_VIEW = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!CAN_VIEW.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [
    totalDebtors,
    riskBreakdown,
    statusBreakdown,
    pendingPromises,
    brokenPromises,
    upcomingContacts,
    contactsThisMonth,
    topCollectors,
    recentContacts,
  ] = await Promise.all([
    prisma.debtor.count(),

    prisma.debtor.groupBy({
      by: ['riskLevel'],
      _count: true,
    }),

    prisma.debtor.groupBy({
      by: ['status'],
      _count: true,
      _sum: { remainingDebt: true },
    }),

    prisma.promiseToPay.count({
      where: { status: 'PENDING', promisedDate: { gte: now } },
    }),

    prisma.promiseToPay.count({
      where: { status: 'BROKEN' },
    }),

    prisma.promiseToPay.count({
      where: { status: 'PENDING', promisedDate: { lte: next7Days, gte: now } },
    }),

    prisma.debtorContact.count({
      where: { createdAt: { gte: startOfMonth } },
    }),

    prisma.debtorContact.groupBy({
      by: ['performedById'],
      _count: true,
      where: { createdAt: { gte: startOfMonth } },
      orderBy: { _count: { performedById: 'desc' } },
      take: 5,
    }),

    prisma.debtorContact.findMany({
      where: { createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
      include: {
        debtor: { select: { id: true, firstName: true, lastName: true, debtorNumber: true } },
        performedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ])

  // Enrich topCollectors with user names
  const collectorIds = topCollectors.map(c => c.performedById)
  const collectorUsers = await prisma.user.findMany({
    where: { id: { in: collectorIds } },
    select: { id: true, name: true },
  })
  const collectorMap = Object.fromEntries(collectorUsers.map(u => [u.id, u.name]))

  // No-contact debtors (lastContactAt null or >7 days ago)
  const noContactCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const noContactCount = await prisma.debtor.count({
    where: {
      status: { notIn: ['PAID', 'UNREACHABLE'] },
      OR: [
        { lastContactAt: null },
        { lastContactAt: { lt: noContactCutoff } },
      ],
    },
  })

  return NextResponse.json({
    totalDebtors,
    riskBreakdown: Object.fromEntries(riskBreakdown.map(r => [r.riskLevel, r._count])),
    statusBreakdown: statusBreakdown.map(s => ({
      status: s.status,
      count: s._count,
      remainingDebt: s._sum.remainingDebt ?? 0,
    })),
    promises: { pending: pendingPromises, broken: brokenPromises, upcoming7Days: upcomingContacts },
    contacts: { thisMonth: contactsThisMonth, noContact7Days: noContactCount },
    topCollectors: topCollectors.map(c => ({
      userId: c.performedById,
      name: collectorMap[c.performedById] ?? 'Unknown',
      count: c._count,
    })),
    recentContacts,
  })
}
