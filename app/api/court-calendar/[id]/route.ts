import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-handler'

const EXEC_ROLES  = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']
const LEGAL_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'LAWYER', 'ENFORCEMENT', 'TEAM_LEADER']

async function canEdit(event: { createdById: string; assignedLawyerId: string | null; assignedEmployeeId: string | null; department: string | null }, userId: string, role: string, department: string | null | undefined) {
  if (EXEC_ROLES.includes(role)) return true
  if (role === 'MANAGER' && department && event.department === department) return true
  return event.createdById === userId || event.assignedLawyerId === userId || event.assignedEmployeeId === userId
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const event = await prisma.calendarEvent.findUnique({
    where: { id },
    include: { createdBy: { select: { id: true, name: true, role: true } } },
  })
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!await canEdit(event, session.user.id, session.user.role, session.user.department)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return NextResponse.json(event)
} catch (err) {
  return apiError(err)
 }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!LEGAL_ROLES.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const event = await prisma.calendarEvent.findUnique({ where: { id } })
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!await canEdit(event, session.user.id, session.user.role, session.user.department)) {
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

  const updated = await prisma.calendarEvent.update({
    where: { id },
    data: {
      ...(title              !== undefined && { title: title.trim() }),
      ...(eventType          !== undefined && { eventType }),
      ...(startAt            !== undefined && { startAt: new Date(startAt) }),
      ...(endAt              !== undefined && { endAt: endAt ? new Date(endAt) : null }),
      ...(startTime          !== undefined && { startTime }),
      ...(endTime            !== undefined && { endTime }),
      ...(allDay             !== undefined && { allDay }),
      ...(location           !== undefined && { location }),
      ...(googleMapsUrl      !== undefined && { googleMapsUrl }),
      ...(description        !== undefined && { description }),
      ...(courtName          !== undefined && { courtName }),
      ...(caseNumber         !== undefined && { caseNumber }),
      ...(clientName         !== undefined && { clientName }),
      ...(debtorName         !== undefined && { debtorName }),
      ...(status             !== undefined && { status }),
      ...(priority           !== undefined && { priority }),
      ...(department         !== undefined && { department }),
      ...(caseId             !== undefined && { caseId }),
      ...(courtId            !== undefined && { courtId }),
      ...(assignedLawyerId   !== undefined && { assignedLawyerId }),
      ...(assignedEmployeeId !== undefined && { assignedEmployeeId }),
      ...(reminderEnabled    !== undefined && { reminderEnabled }),
      ...(note               !== undefined && { note }),
    },
    include: { createdBy: { select: { id: true, name: true, role: true } } },
  })

  return NextResponse.json(updated)
} catch (err) {
  return apiError(err)
 }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const event = await prisma.calendarEvent.findUnique({ where: { id } })
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!await canEdit(event, session.user.id, session.user.role, session.user.department)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.calendarEvent.delete({ where: { id } })
  return NextResponse.json({ ok: true })
} catch (err) {
  return apiError(err)
 }
}
