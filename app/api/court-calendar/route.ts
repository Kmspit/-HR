import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-handler'
import { findCalendarEventOverlaps } from '@/lib/calendar-overlap'

const EXEC_ROLES    = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']
const LEGAL_ROLES   = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'LAWYER', 'ENFORCEMENT', 'TEAM_LEADER']

// ── Permission scope builder ───────────────────────────────────────────────────
function buildAccessWhere(role: string, userId: string, department: string | null | undefined) {
  if (EXEC_ROLES.includes(role)) return {}
  if (role === 'MANAGER' && department) return { department }
  return {
    OR: [
      { createdById: userId },
      { assignedLawyerId: userId },
      { assignedEmployeeId: userId },
    ],
  }
}

// ── Map CaseCourt to unified event format ─────────────────────────────────────
function mapCaseCourt(court: {
  id: string; caseId: string; courtName: string; courtDate: Date
  appointmentTime: string | null; judgeName: string | null; result: string | null; note: string | null
  case: { caseNumber: string; caseTitle: string; assignedEmployeeId: string | null; status: string }
  createdBy: { id: string; name: string }
}) {
  return {
    id:                 `case_court_${court.id}`,
    source:             'case_court' as const,
    eventType:          'COURT_APPOINTMENT',
    title:              `${court.courtName} — ${court.case.caseTitle}`,
    description:        court.note,
    startAt:            court.courtDate.toISOString(),
    startTime:          court.appointmentTime,
    endTime:            null,
    courtName:          court.courtName,
    caseNumber:         court.case.caseNumber,
    caseId:             court.caseId,
    courtId:            court.id,
    status:             court.result ? 'COMPLETED' : (court.case.status === 'CANCELLED' ? 'CANCELLED' : 'SCHEDULED'),
    priority:           'HIGH',
    assignedLawyerId:   court.case.assignedEmployeeId,
    assignedEmployeeId: court.case.assignedEmployeeId,
    location:           null,
    googleMapsUrl:      null,
    reminderEnabled:    true,
    isEditable:         false,
    link:               `/cases/${court.caseId}`,
    createdBy:          court.createdBy,
    allDay:             false,
    department:         null,
    note:               court.note,
    judgeName:          court.judgeName,
  }
}

// ── Map TaskAssignment.courtDate to unified event ─────────────────────────────
function mapTaskCourt(task: {
  id: string; title: string; status: string; courtDate: Date | null
  caseNumber: string | null; assigneeId: string
  assignee: { id: string; name: string }
}) {
  if (!task.courtDate) return null
  return {
    id:                 `task_court_${task.id}`,
    source:             'task' as const,
    eventType:          'LEGAL_DEADLINE',
    title:              task.title,
    description:        null,
    startAt:            task.courtDate.toISOString(),
    startTime:          null,
    endTime:            null,
    courtName:          null,
    caseNumber:         task.caseNumber,
    caseId:             null,
    courtId:            null,
    status:             task.status === 'COMPLETED' ? 'COMPLETED' : 'SCHEDULED',
    priority:           'MEDIUM',
    assignedLawyerId:   task.assigneeId,
    assignedEmployeeId: task.assigneeId,
    location:           null,
    googleMapsUrl:      null,
    reminderEnabled:    false,
    isEditable:         false,
    link:               `/tasks`,
    createdBy:          task.assignee,
    allDay:             true,
    department:         null,
    note:               null,
    judgeName:          null,
  }
}

// ── GET — aggregated events ────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!LEGAL_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const from       = searchParams.get('from')
  const to         = searchParams.get('to')
  const eventType  = searchParams.get('eventType')
  const priority   = searchParams.get('priority')
  const status     = searchParams.get('status')
  const lawyerId   = searchParams.get('lawyerId')
  const q          = searchParams.get('q')?.trim()

  if (!from || !to) return NextResponse.json({ error: 'from and to required' }, { status: 400 })

  const fromDate = new Date(from)
  const toDate   = new Date(to)
  const accessWhere = buildAccessWhere(session.user.role, session.user.id, session.user.department)

  // 1. CalendarEvent records
  const calendarWhere: Record<string, unknown> = {
    startAt: { gte: fromDate, lte: toDate },
    ...accessWhere,
  }
  if (eventType) calendarWhere.eventType = eventType
  if (priority)  calendarWhere.priority  = priority
  if (status)    calendarWhere.status    = status
  if (lawyerId)  calendarWhere.assignedLawyerId = lawyerId
  if (q) {
    calendarWhere.OR = [
      { title:      { contains: q } },
      { courtName:  { contains: q } },
      { caseNumber: { contains: q } },
      { clientName: { contains: q } },
      { debtorName: { contains: q } },
    ]
  }

  // 2. CaseCourt records (read-only overlay)
  const caseCourtWhere: Record<string, unknown> = {
    courtDate: { gte: fromDate, lte: toDate },
  }
  if (!EXEC_ROLES.includes(session.user.role)) {
    if (session.user.role === 'MANAGER') {
      caseCourtWhere.case = { department: session.user.department }
    } else {
      caseCourtWhere.case = {
        OR: [
          { assignedEmployeeId: session.user.id },
          { createdById: session.user.id },
        ],
      }
    }
  }

  // 3. Task courtDate overlay
  const taskCourtWhere: Record<string, unknown> = {
    courtDate: { gte: fromDate, lte: toDate },
    status: { notIn: ['COMPLETED', 'CANCELLED'] },
  }
  if (!EXEC_ROLES.includes(session.user.role)) {
    taskCourtWhere.assigneeId = session.user.id
  }

  // 4. CourtEvent records (primary production model)
  const courtEventWhere: Record<string, unknown> = {
    appointmentDate: { gte: fromDate, lte: toDate },
  }
  if (!EXEC_ROLES.includes(session.user.role)) {
    if (session.user.role === 'MANAGER' && session.user.department) {
      courtEventWhere.case = { department: session.user.department }
    } else {
      courtEventWhere.OR = [
        { createdById: session.user.id },
        { assignedLawyerId: session.user.id },
      ]
    }
  }
  if (priority) courtEventWhere.priority = priority
  if (status)   courtEventWhere.status   = status
  if (lawyerId) courtEventWhere.assignedLawyerId = lawyerId

  const [calendarEvents, caseCourts, taskCourts, courtEvents] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: calendarWhere,
      include: { createdBy: { select: { id: true, name: true, role: true } } },
      orderBy: { startAt: 'asc' },
      take: 200,
    }),
    prisma.caseCourt.findMany({
      where: caseCourtWhere,
      include: {
        case:      { select: { caseNumber: true, caseTitle: true, assignedEmployeeId: true, status: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { courtDate: 'asc' },
      take: 100,
    }),
    prisma.taskAssignment.findMany({
      where: taskCourtWhere,
      select: { id: true, title: true, status: true, courtDate: true, caseNumber: true, assigneeId: true, assignee: { select: { id: true, name: true } } },
      orderBy: { courtDate: 'asc' },
      take: 100,
    }),
    prisma.courtEvent.findMany({
      where: courtEventWhere,
      include: {
        case:           { select: { id: true, caseNumber: true, caseTitle: true } },
        assignedLawyer: { select: { id: true, name: true } },
        createdBy:      { select: { id: true, name: true } },
      },
      orderBy: { appointmentDate: 'asc' },
      take: 200,
    }),
  ])

  // Map and merge
  const calendarMapped = calendarEvents.map(e => ({
    id:                 e.id,
    source:             'calendar' as const,
    eventType:          e.eventType,
    title:              e.title,
    description:        e.description,
    startAt:            e.startAt.toISOString(),
    startTime:          e.startTime,
    endTime:            e.endTime,
    courtName:          e.courtName,
    caseNumber:         e.caseNumber,
    caseId:             e.caseId,
    courtId:            e.courtId,
    status:             e.status,
    priority:           e.priority,
    assignedLawyerId:   e.assignedLawyerId,
    assignedEmployeeId: e.assignedEmployeeId,
    location:           e.location,
    googleMapsUrl:      e.googleMapsUrl,
    reminderEnabled:    e.reminderEnabled,
    isEditable:         true,
    link:               e.caseId ? `/cases/${e.caseId}` : null,
    createdBy:          e.createdBy,
    allDay:             e.allDay,
    department:         e.department,
    note:               e.note,
    judgeName:          null,
    clientName:         e.clientName,
    debtorName:         e.debtorName,
  }))

  const caseCourtMapped = caseCourts.map(mapCaseCourt)
  const taskCourtMapped = taskCourts.map(mapTaskCourt).filter(Boolean)

  const courtEventMapped = courtEvents.map(e => ({
    id:                 e.id,
    source:             'court_event' as const,
    eventType:          e.appointmentType,
    title:              `${e.courtName} — ${e.case.caseTitle}`,
    description:        e.note,
    startAt:            e.appointmentDate.toISOString(),
    startTime:          e.appointmentTime,
    endTime:            null,
    courtName:          e.courtName,
    caseNumber:         e.case.caseNumber,
    caseId:             e.caseId,
    courtId:            e.id,
    status:             e.status as string,
    priority:           e.priority as string,
    assignedLawyerId:   e.assignedLawyerId,
    assignedEmployeeId: e.assignedLawyerId,
    location:           e.location,
    googleMapsUrl:      e.location ? `https://maps.google.com/?q=${encodeURIComponent(e.location)}` : null,
    reminderEnabled:    true,
    isEditable:         true,
    link:               `/cases/${e.caseId}`,
    createdBy:          e.createdBy,
    allDay:             false,
    department:         null,
    note:               e.note,
    judgeName:          e.judgeName,
    clientName:         null,
    debtorName:         null,
    courtType:          e.courtType as string,
    appointmentType:    e.appointmentType as string,
    roomNumber:         e.roomNumber,
    appointmentNumber:  e.appointmentNumber,
    assignedLawyer:     e.assignedLawyer,
  }))

  // Merge all, sort by startAt
  const all = [...calendarMapped, ...caseCourtMapped, ...taskCourtMapped, ...courtEventMapped]
  all.sort((a, b) => new Date(a!.startAt).getTime() - new Date(b!.startAt).getTime())

  return NextResponse.json({ events: all })
} catch (err) {
  return apiError(err)
 }
}

// ── POST — create CalendarEvent ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!LEGAL_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const {
    title, eventType, startAt, endAt, startTime, endTime, allDay,
    location, googleMapsUrl, description, courtName, caseNumber,
    clientName, debtorName, status, priority, department,
    caseId, courtId, assignedLawyerId, assignedEmployeeId,
    reminderEnabled, note,
  } = body

  if (!title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 })
  if (!startAt)       return NextResponse.json({ error: 'startAt required' }, { status: 400 })

  const parsedStartAt = new Date(startAt)
  const parsedEndAt = endAt ? new Date(endAt) : null

  // Soft double-booking check — warns, never blocks (see lib/calendar-overlap.ts).
  const warnings = await findCalendarEventOverlaps({
    startAt: parsedStartAt,
    endAt: parsedEndAt,
    assignedLawyerId: assignedLawyerId ?? null,
    createdById: session.user.id,
  })

  const event = await prisma.calendarEvent.create({
    data: {
      title:              title.trim(),
      eventType:          eventType ?? 'OTHER',
      startAt:            parsedStartAt,
      endAt:              parsedEndAt,
      startTime:          startTime ?? null,
      endTime:            endTime ?? null,
      allDay:             allDay ?? false,
      location:           location ?? null,
      googleMapsUrl:      googleMapsUrl ?? null,
      description:        description ?? null,
      courtName:          courtName ?? null,
      caseNumber:         caseNumber ?? null,
      clientName:         clientName ?? null,
      debtorName:         debtorName ?? null,
      status:             status ?? 'SCHEDULED',
      priority:           priority ?? 'MEDIUM',
      department:         department ?? session.user.department ?? null,
      caseId:             caseId ?? null,
      courtId:            courtId ?? null,
      assignedLawyerId:   assignedLawyerId ?? null,
      assignedEmployeeId: assignedEmployeeId ?? null,
      reminderEnabled:    reminderEnabled !== false,
      note:               note ?? null,
      createdById:        session.user.id,
    },
    include: { createdBy: { select: { id: true, name: true, role: true } } },
  })

  return NextResponse.json({ ...event, warnings }, { status: 201 })
} catch (err) {
  return apiError(err)
 }
}
