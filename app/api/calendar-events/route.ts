import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { findCalendarEventOverlaps } from '@/lib/calendar-overlap'

const WRITE_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER', 'LAWYER', 'ENFORCEMENT', 'EMPLOYEE']

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const startDate  = searchParams.get('start')
  const endDate    = searchParams.get('end')
  const type       = searchParams.get('type')
  const department = searchParams.get('department')
  const status     = searchParams.get('status')

  const role   = session.user.role as string
  const userId = session.user.id

  const isAdmin = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN'].includes(role)

  const where: Record<string, unknown> = {}
  if (!isAdmin) {
    where.createdById = userId
  }
  if (startDate) where.startAt = { ...(where.startAt as object ?? {}), gte: new Date(startDate) }
  if (endDate)   where.startAt = { ...(where.startAt as object ?? {}), lte: new Date(endDate) }
  if (type && type !== 'ALL') where.eventType = type
  if (department) where.department = department
  if (status && status !== 'ALL') where.status = status

  try {
    const items = await prisma.calendarEvent.findMany({
      where,
      include: { createdBy: { select: { name: true, position: true } } },
      orderBy: { startAt: 'asc' },
      take: 200,
    })
    return NextResponse.json({ items })
  } catch (error) {
    console.error('[calendar-events GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!WRITE_ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const {
    title, eventType = 'INTERNAL', startAt, endAt, allDay = false,
    location, locationLat, locationLng, description,
    courtName, caseNumber, clientName, debtorName, debtAmount,
    status = 'SCHEDULED', priority = 'NORMAL', department,
    attendees = [], note,
  } = body

  if (!title || !startAt) return NextResponse.json({ error: 'title and startAt required' }, { status: 400 })

  try {
    const parsedStartAt = new Date(startAt)
    const parsedEndAt = endAt ? new Date(endAt) : null

    // Soft double-booking check — warns, never blocks (see lib/calendar-overlap.ts).
    const warnings = await findCalendarEventOverlaps({
      startAt: parsedStartAt,
      endAt: parsedEndAt,
      createdById: session.user.id,
    })

    const event = await prisma.calendarEvent.create({
      data: {
        title, eventType,
        startAt: parsedStartAt,
        endAt: parsedEndAt,
        allDay, location, locationLat, locationLng, description,
        courtName, caseNumber, clientName, debtorName, debtAmount,
        status, priority, department,
        attendees: JSON.stringify(attendees),
        note,
        createdById: session.user.id,
      },
      include: { createdBy: { select: { name: true } } },
    })
    return NextResponse.json({ ...event, warnings }, { status: 201 })
  } catch (error) {
    console.error('[calendar-events POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
