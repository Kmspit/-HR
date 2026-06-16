import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

const EXEC_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now     = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd   = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1)
  const weekEnd    = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)
  const nextMonthEnd = new Date(todayStart.getTime() + 30 * 24 * 60 * 60 * 1000)

  const isExec = EXEC_ROLES.includes(session.user.role)

  // Scope for CalendarEvent
  const calScope: Record<string, unknown> = isExec ? {} : {
    OR: [
      { createdById:        session.user.id },
      { assignedLawyerId:   session.user.id },
      { assignedEmployeeId: session.user.id },
    ],
  }

  // Scope for CaseCourt
  const courtScope: Record<string, unknown> = isExec ? {} : {
    case: {
      OR: [
        { assignedEmployeeId: session.user.id },
        { createdById:        session.user.id },
      ],
    },
  }

  const [
    todayCalendar,
    todayCaseCourt,
    weekCalendar,
    weekCaseCourt,
    missedCalendar,
    missedCaseCourt,
    criticalUpcoming,
  ] = await Promise.all([
    prisma.calendarEvent.count({ where: { startAt: { gte: todayStart, lte: todayEnd }, status: { notIn: ['CANCELLED'] }, ...calScope } }),
    prisma.caseCourt.count({ where: { courtDate: { gte: todayStart, lte: todayEnd }, ...courtScope } }),
    prisma.calendarEvent.count({ where: { startAt: { gte: todayStart, lte: weekEnd }, status: { notIn: ['CANCELLED'] }, ...calScope } }),
    prisma.caseCourt.count({ where: { courtDate: { gte: todayStart, lte: weekEnd }, ...courtScope } }),
    prisma.calendarEvent.count({ where: { status: 'MISSED', ...calScope } }),
    prisma.caseCourt.count({ where: { courtDate: { lt: now }, result: null, case: { status: { notIn: ['COMPLETED', 'CANCELLED'] } }, ...courtScope } }),
    prisma.calendarEvent.count({ where: { priority: 'CRITICAL', startAt: { gte: now, lte: nextMonthEnd }, status: 'SCHEDULED', ...calScope } }),
  ])

  // Next 5 upcoming events
  const upcomingEvents = await prisma.calendarEvent.findMany({
    where: { startAt: { gte: now }, status: 'SCHEDULED', ...calScope },
    orderBy: { startAt: 'asc' },
    take: 5,
    select: { id: true, title: true, eventType: true, startAt: true, startTime: true, courtName: true, caseNumber: true, priority: true },
  })

  return NextResponse.json({
    today:           todayCalendar + todayCaseCourt,
    thisWeek:        weekCalendar + weekCaseCourt,
    missed:          missedCalendar + missedCaseCourt,
    criticalUpcoming,
    upcomingEvents,
  })
}
