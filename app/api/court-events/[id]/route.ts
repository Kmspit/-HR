import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { triggerAutomation } from '@/lib/automation-engine'
import { createNotification, notifyRole, sendLineMessage } from '@/lib/notifications'
import { requireCsrf } from '@/lib/api-guard'

const EXEC_ROLES  = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']
const LEGAL_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'LAWYER', 'ENFORCEMENT', 'TEAM_LEADER']

// Matches the case-level `canEdit` gate in app/(dashboard)/cases/[id]/page.tsx that
// controls whether the court-events edit/delete buttons are shown: EXEC roles, the
// event's own creator/assigned lawyer, the case's creator/assignee, or a MANAGER in
// the case's own department. Checking only the event's own creator/lawyer (as before)
// left case-level assignees and same-department managers seeing buttons the API then
// rejected with 403.
async function canEdit(
  event: { caseId: string; createdById: string; assignedLawyerId: string | null },
  userId: string,
  role: string,
  department?: string | null,
) {
  if (EXEC_ROLES.includes(role)) return true
  if (event.createdById === userId || event.assignedLawyerId === userId) return true

  const c = await prisma.case.findUnique({
    where: { id: event.caseId },
    select: { createdById: true, assignedEmployeeId: true, department: true },
  })
  if (!c) return false
  if (role === 'MANAGER' && department && c.department === department) return true
  return c.createdById === userId || c.assignedEmployeeId === userId
}

async function handleMissed(event: {
  id: string; caseId: string; courtName: string; appointmentType: string
  priority: string; assignedLawyerId: string | null; createdById: string
  case: { caseNumber: string; caseTitle: string }
}, performedById: string) {
  const link    = `/cases/${event.caseId}`
  const typeStr = event.appointmentType
  const message = `${event.courtName} — ${event.case.caseTitle} [${event.case.caseNumber}]`

  // Notify creator and assigned lawyer
  const recipientIds = new Set<string>([event.createdById])
  if (event.assignedLawyerId) recipientIds.add(event.assignedLawyerId)
  for (const userId of recipientIds) {
    void createNotification({ userId, type: 'CALENDAR_REMINDER', title: `⚠️ พลาดนัด ${typeStr}`, message, link })
    void sendLineMessage(userId, `⚠️ พลาดนัด ${typeStr}\n${message}`)
  }

  // Notify manager always
  void notifyRole('MANAGER', 'CALENDAR_REMINDER', `🚨 พลาดนัดศาล (${event.priority})`, message, link)

  // Notify CEO if CRITICAL
  if (event.priority === 'CRITICAL') {
    void notifyRole('CEO', 'CALENDAR_REMINDER', `🚨 วิกฤต: พลาดนัดศาล`, message, link)
  }

  // Auto-create task
  const task = await prisma.taskAssignment.create({
    data: {
      title:       `[พลาดนัด] ${event.courtName} — ${event.case.caseTitle}`,
      description: `นัด ${typeStr} ที่ ${event.courtName} ไม่ได้เข้าร่วม ต้องดำเนินการด่วน`,
      status:      'PENDING',
      priority:    event.priority === 'CRITICAL' || event.priority === 'HIGH' ? 'HIGH' : 'MEDIUM',
      assigneeId:  event.assignedLawyerId ?? performedById,
      assignedById: performedById,
      caseNumber:  event.case.caseNumber,
      dueDate:     new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  })

  // Add to case timeline
  void prisma.caseTimeline.create({
    data: {
      caseId:      event.caseId,
      userId:      performedById,
      action:      'COURT_MISSED',
      description: `พลาดนัด ${typeStr} ที่ ${event.courtName}`,
      meta:        JSON.stringify({ courtEventId: event.id, taskId: task.id, priority: event.priority }),
    },
  }).catch(() => undefined)

  // Fire automation
  triggerAutomation('COURT_MISSED', {
    courtEventId:    event.id,
    caseId:          event.caseId,
    caseNumber:      event.case.caseNumber,
    courtName:       event.courtName,
    appointmentType: event.appointmentType,
    priority:        event.priority,
    assignedLawyerId: event.assignedLawyerId,
    autoTaskId:      task.id,
  }, performedById).catch(() => undefined)
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!LEGAL_ROLES.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const event = await prisma.courtEvent.findUnique({
    where: { id },
    include: {
      case:           { select: { id: true, caseNumber: true, caseTitle: true, caseType: true, status: true } },
      assignedLawyer: { select: { id: true, name: true, role: true } },
      createdBy:      { select: { id: true, name: true, role: true } },
    },
  })
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!await canEdit(event, session.user.id, session.user.role, session.user.department)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json(event)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfErr = requireCsrf(req)
  if (csrfErr) return csrfErr

  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!LEGAL_ROLES.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const existing = await prisma.courtEvent.findUnique({
    where: { id },
    include: { case: { select: { caseNumber: true, caseTitle: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!await canEdit(existing, session.user.id, session.user.role, session.user.department)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const {
    courtName, courtType, appointmentType, appointmentDate, appointmentTime,
    location, judgeName, roomNumber, appointmentNumber, status, priority,
    assignedLawyerId, assignedTeamId, note, documentId,
  } = body

  const prevStatus = existing.status

  const updated = await prisma.courtEvent.update({
    where: { id },
    data: {
      ...(courtName         !== undefined && { courtName: courtName.trim() }),
      ...(courtType         !== undefined && { courtType }),
      ...(appointmentType   !== undefined && { appointmentType }),
      ...(appointmentDate   !== undefined && { appointmentDate: new Date(appointmentDate) }),
      ...(appointmentTime   !== undefined && { appointmentTime }),
      ...(location          !== undefined && { location }),
      ...(judgeName         !== undefined && { judgeName }),
      ...(roomNumber        !== undefined && { roomNumber }),
      ...(appointmentNumber !== undefined && { appointmentNumber }),
      ...(status            !== undefined && { status }),
      ...(priority          !== undefined && { priority }),
      ...(assignedLawyerId  !== undefined && { assignedLawyerId }),
      ...(assignedTeamId    !== undefined && { assignedTeamId }),
      ...(note              !== undefined && { note }),
      ...(documentId        !== undefined && { documentId }),
    },
    include: {
      case:           { select: { id: true, caseNumber: true, caseTitle: true } },
      assignedLawyer: { select: { id: true, name: true } },
      createdBy:      { select: { id: true, name: true } },
    },
  })

  // Handle MISSED status transition
  if (status === 'MISSED' && prevStatus !== 'MISSED') {
    await handleMissed({
      id: updated.id,
      caseId: updated.caseId,
      courtName: updated.courtName,
      appointmentType: updated.appointmentType,
      priority: updated.priority,
      assignedLawyerId: updated.assignedLawyerId,
      createdById: updated.createdById,
      case: updated.case,
    }, session.user.id)
  }

  // Track status change in timeline
  if (status !== undefined && status !== prevStatus) {
    void prisma.caseTimeline.create({
      data: {
        caseId:      updated.caseId,
        userId:      session.user.id,
        action:      'COURT_STATUS_CHANGED',
        description: `เปลี่ยนสถานะนัดศาล ${updated.courtName}: ${prevStatus} → ${status}`,
        meta:        JSON.stringify({ courtEventId: id, from: prevStatus, to: status }),
      },
    }).catch(() => undefined)
  }

  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfErr = requireCsrf(req)
  if (csrfErr) return csrfErr

  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!LEGAL_ROLES.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const event = await prisma.courtEvent.findUnique({ where: { id } })
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!await canEdit(event, session.user.id, session.user.role, session.user.department)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.courtEvent.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
