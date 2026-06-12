import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ADMIN_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const event = await prisma.calendarEvent.findUnique({
    where: { id },
    include: { createdBy: { select: { name: true, position: true } } },
  })
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(event)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const event = await prisma.calendarEvent.findUnique({ where: { id } })
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isAdmin = ADMIN_ROLES.includes(session.user.role as string)
  if (!isAdmin && event.createdById !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const {
    title, eventType, startAt, endAt, allDay, location, locationLat, locationLng,
    description, courtName, caseNumber, clientName, debtorName, debtAmount,
    status, priority, department, attendees, note,
  } = body

  const updated = await prisma.calendarEvent.update({
    where: { id },
    data: {
      ...(title       !== undefined && { title }),
      ...(eventType   !== undefined && { eventType }),
      ...(startAt     !== undefined && { startAt: new Date(startAt) }),
      ...(endAt       !== undefined && { endAt: endAt ? new Date(endAt) : null }),
      ...(allDay      !== undefined && { allDay }),
      ...(location    !== undefined && { location }),
      ...(locationLat !== undefined && { locationLat }),
      ...(locationLng !== undefined && { locationLng }),
      ...(description !== undefined && { description }),
      ...(courtName   !== undefined && { courtName }),
      ...(caseNumber  !== undefined && { caseNumber }),
      ...(clientName  !== undefined && { clientName }),
      ...(debtorName  !== undefined && { debtorName }),
      ...(debtAmount  !== undefined && { debtAmount }),
      ...(status      !== undefined && { status }),
      ...(priority    !== undefined && { priority }),
      ...(department  !== undefined && { department }),
      ...(attendees   !== undefined && { attendees: JSON.stringify(attendees) }),
      ...(note        !== undefined && { note }),
    },
    include: { createdBy: { select: { name: true } } },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const event = await prisma.calendarEvent.findUnique({ where: { id } })
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isAdmin = ADMIN_ROLES.includes(session.user.role as string)
  if (!isAdmin && event.createdById !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.calendarEvent.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
