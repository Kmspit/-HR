import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'

// Color map for event types
const EVENT_TYPE_META: Record<string, { label: string; color: string }> = {
  COURT:      { label: 'นัดศาล',    color: '#ef4444' },
  CLIENT:     { label: 'นัดลูกค้า', color: '#22c55e' },
  DEBTOR:     { label: 'นัดลูกหนี้', color: '#f97316' },
  INTERNAL:   { label: 'ภายใน',     color: '#22c55e' },
  TASK_COURT: { label: 'ศาล(งาน)',  color: '#dc2626' },
  TASK_APPT:  { label: 'นัด(งาน)',  color: '#6366f1' },
  PAYMENT:    { label: 'นัดชำระ',   color: '#f59e0b' },
}

export async function GET(req: NextRequest) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const startStr = searchParams.get('start')
  const endStr   = searchParams.get('end')
  const typeFilter = searchParams.get('type') ?? 'ALL'

  const start = startStr ? new Date(startStr) : (() => { const d = new Date(); d.setDate(1); return d })()
  const end   = endStr   ? new Date(endStr)   : new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59)

  const role   = session.user.role as string
  const userId = session.user.id
  const isAdmin  = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN'].includes(role)
  const isMgr    = ['MANAGER', 'TEAM_LEADER'].includes(role)

  // Fetch team member IDs for managers
  let teamIds: string[] = [userId]
  if (isMgr) {
    const members = await prisma.user.findMany({
      where: { OR: [{ managerId: userId }, { teamLeaderId: userId }] },
      select: { id: true },
    })
    teamIds = [userId, ...members.map((m) => m.id)]
  }

  const dateRange = { gte: start, lte: end }

  const [calEvents, tasksCourt, tasksAppt, payments] = await Promise.all([
    // 1. CalendarEvent (own for non-admin)
    prisma.calendarEvent.findMany({
      where: {
        startAt: dateRange,
        status: { not: 'CANCELLED' },
        ...(isAdmin ? {} : { createdById: isMgr ? { in: teamIds } : userId }),
        ...(typeFilter !== 'ALL' && { eventType: typeFilter }),
      },
      include: { createdBy: { select: { name: true } } },
      orderBy: { startAt: 'asc' },
      take: 500,
    }),
    // 2. TaskAssignment — courtDate
    (typeFilter === 'ALL' || typeFilter === 'COURT')
      ? prisma.taskAssignment.findMany({
          where: {
            courtDate: dateRange,
            ...(isAdmin ? {} : { assigneeId: isMgr ? { in: teamIds } : userId }),
          },
          select: {
            id: true, title: true, courtDate: true, appointmentPlace: true,
            caseNumber: true, status: true, priority: true,
            assignee: { select: { name: true } },
          },
          orderBy: { courtDate: 'asc' },
          take: 200,
        })
      : Promise.resolve([]),
    // 3. TaskAssignment — appointmentDate
    (typeFilter === 'ALL' || typeFilter === 'CLIENT')
      ? prisma.taskAssignment.findMany({
          where: {
            appointmentDate: dateRange,
            courtDate: null,
            ...(isAdmin ? {} : { assigneeId: isMgr ? { in: teamIds } : userId }),
          },
          select: {
            id: true, title: true, appointmentDate: true, appointmentPlace: true,
            caseNumber: true, clientName: true, status: true, priority: true,
            assignee: { select: { name: true } },
          },
          orderBy: { appointmentDate: 'asc' },
          take: 200,
        })
      : Promise.resolve([]),
    // 4. PaymentAppointment — debtor
    (typeFilter === 'ALL' || typeFilter === 'DEBTOR')
      ? prisma.paymentAppointment.findMany({
          where: {
            appointDate: dateRange,
            status: { not: 'CANCELLED' },
            ...(isAdmin ? {} : { createdById: isMgr ? { in: teamIds } : userId }),
          },
          select: {
            id: true, appointDate: true, location: true, agreedAmount: true,
            status: true, note: true,
            debtor: { select: { firstName: true, lastName: true, caseNumber: true } },
          },
          orderBy: { appointDate: 'asc' },
          take: 200,
        })
      : Promise.resolve([]),
  ])

  // Normalize all into unified shape
  type UEvent = {
    id: string; source: string; eventType: string
    title: string; startAt: string; endAt: string | null
    location: string | null; status: string; priority: string
    caseNumber: string | null; courtName: string | null
    clientName: string | null; debtorName: string | null
    assigneeName: string | null; note: string | null
    color: string
  }

  const unified: UEvent[] = []

  for (const e of calEvents) {
    unified.push({
      id: e.id, source: 'event', eventType: e.eventType,
      title: e.title,
      startAt: e.startAt.toISOString(),
      endAt: e.endAt?.toISOString() ?? null,
      location: e.location,
      status: e.status,
      priority: e.priority,
      caseNumber: e.caseNumber,
      courtName: e.courtName,
      clientName: e.clientName,
      debtorName: e.debtorName,
      assigneeName: e.createdBy.name,
      note: e.note,
      color: EVENT_TYPE_META[e.eventType]?.color ?? '#6b7280',
    })
  }

  for (const t of tasksCourt) {
    if (!t.courtDate) continue
    unified.push({
      id: `task-court-${t.id}`, source: 'task', eventType: 'TASK_COURT',
      title: t.title,
      startAt: t.courtDate.toISOString(),
      endAt: null,
      location: t.appointmentPlace ?? null,
      status: t.status,
      priority: t.priority,
      caseNumber: t.caseNumber ?? null,
      courtName: null,
      clientName: null,
      debtorName: null,
      assigneeName: t.assignee.name,
      note: null,
      color: EVENT_TYPE_META.TASK_COURT.color,
    })
  }

  for (const t of tasksAppt) {
    if (!t.appointmentDate) continue
    unified.push({
      id: `task-appt-${t.id}`, source: 'task', eventType: 'TASK_APPT',
      title: t.title,
      startAt: t.appointmentDate.toISOString(),
      endAt: null,
      location: t.appointmentPlace ?? null,
      status: t.status,
      priority: t.priority,
      caseNumber: t.caseNumber ?? null,
      courtName: null,
      clientName: t.clientName ?? null,
      debtorName: null,
      assigneeName: t.assignee.name,
      note: null,
      color: EVENT_TYPE_META.TASK_APPT.color,
    })
  }

  for (const p of payments) {
    const debtorName = `${p.debtor.firstName} ${p.debtor.lastName}`.trim()
    unified.push({
      id: `payment-${p.id}`, source: 'payment', eventType: 'PAYMENT',
      title: `นัดชำระ — ${debtorName}`,
      startAt: p.appointDate.toISOString(),
      endAt: null,
      location: p.location ?? null,
      status: p.status,
      priority: 'NORMAL',
      caseNumber: p.debtor.caseNumber ?? null,
      courtName: null,
      clientName: null,
      debtorName,
      assigneeName: null,
      note: p.note ?? null,
      color: EVENT_TYPE_META.PAYMENT.color,
    })
  }

  unified.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())

  return NextResponse.json({ items: unified, meta: EVENT_TYPE_META })
} catch (err) {
  return apiError(err)
 }
}
