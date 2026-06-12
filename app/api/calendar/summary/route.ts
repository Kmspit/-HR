import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now        = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
  const in7        = new Date(now.getTime() + 7  * 86400_000)
  const in30       = new Date(now.getTime() + 30 * 86400_000)

  const role   = session.user.role as string
  const userId = session.user.id
  const isAdmin = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN'].includes(role)

  const ownerFilter = isAdmin ? {} : { createdById: userId }

  const [
    todayEvents, upcomingEvents, courtIn7, courtIn30,
    missedEvents, todayPayments, byType,
  ] = await Promise.all([
    // Today's calendar events
    prisma.calendarEvent.count({
      where: { ...ownerFilter, startAt: { gte: todayStart, lte: todayEnd }, status: { not: 'CANCELLED' } },
    }),
    // Upcoming (next 7 days) calendar events
    prisma.calendarEvent.findMany({
      where: { ...ownerFilter, startAt: { gte: now, lte: in7 }, status: { not: 'CANCELLED' } },
      include: { createdBy: { select: { name: true } } },
      orderBy: { startAt: 'asc' },
      take: 10,
    }),
    // Court dates (TaskAssignment) in next 7 days
    prisma.taskAssignment.count({
      where: {
        courtDate: { gte: now, lte: in7 },
        ...(isAdmin ? {} : { assigneeId: userId }),
      },
    }),
    // Court dates in next 30 days
    prisma.taskAssignment.count({
      where: {
        courtDate: { gte: now, lte: in30 },
        ...(isAdmin ? {} : { assigneeId: userId }),
      },
    }),
    // Missed/overdue events
    prisma.calendarEvent.count({
      where: { ...ownerFilter, startAt: { lt: now }, status: 'SCHEDULED' },
    }),
    // Today's payment appointments
    prisma.paymentAppointment.count({
      where: { appointDate: { gte: todayStart, lte: todayEnd }, status: 'PENDING' },
    }),
    // Events by type (this month)
    prisma.calendarEvent.groupBy({
      by: ['eventType'],
      where: {
        ...ownerFilter,
        startAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) },
        status: { not: 'CANCELLED' },
      },
      _count: { id: true },
    }),
  ])

  return NextResponse.json({
    todayEvents,
    todayPayments,
    upcomingEvents,
    courtIn7,
    courtIn30,
    missedEvents,
    byType: byType.map((r) => ({ eventType: r.eventType, count: r._count.id })),
  })
}
