import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { createNotification } from '@/lib/notifications'

const CAN_MANAGE_ALL = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR']
const CAN_REVIEW     = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']

const userSelect = { id: true, name: true, department: true, employeeId: true, role: true } as const

const fullTaskInclude = {
  assignee:    { select: userSelect },
  assignedBy:  { select: userSelect },
  reviewedBy:  { select: userSelect },
  attachments: {
    include: { uploadedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
  comments: {
    where: { parentId: null },
    select: {
      id: true, content: true, parentId: true, createdAt: true, updatedAt: true,
      user: { select: { id: true, name: true, role: true } },
      replies: {
        select: {
          id: true, content: true, parentId: true, createdAt: true, updatedAt: true,
          user: { select: { id: true, name: true, role: true } },
        },
        orderBy: { createdAt: 'asc' as const },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  checklist: {
    select: {
      id: true, title: true, isCompleted: true, order: true, completedAt: true,
      completedBy: { select: { id: true, name: true } },
    },
    orderBy: { order: 'asc' as const },
  },
} as const

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const task = await prisma.taskAssignment.findUnique({
    where: { id },
    include: fullTaskInclude,
  })

  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const canView =
    task.assigneeId   === session.user.id ||
    task.assignedById === session.user.id ||
    CAN_MANAGE_ALL.includes(session.user.role)

  if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return NextResponse.json({ task })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const task = await prisma.taskAssignment.findUnique({ where: { id } })
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const role     = session.user.role
  const userId   = session.user.id
  const userName = session.user.name ?? ''
  const body     = await req.json()

  const isAssignee   = task.assigneeId   === userId
  const isAssigner   = task.assignedById === userId
  const isFullAdmin  = CAN_MANAGE_ALL.includes(role)
  const isReviewer   = CAN_REVIEW.includes(role) && (isAssigner || isFullAdmin)

  if (!isAssignee && !isReviewer && !isFullAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let data: Record<string, unknown> = {}

  function appendProgressNote(existing: string | null, note: string): string {
    const arr: { note: string; timestamp: string; userId: string; userName: string }[] =
      existing ? JSON.parse(existing) : []
    arr.push({ note, timestamp: new Date().toISOString(), userId, userName })
    return JSON.stringify(arr)
  }

  if (isAssignee && !isReviewer && !isFullAdmin) {
    // Employee: can update progress, submit result, cancel own task
    const ALLOWED_STATUSES = ['IN_PROGRESS', 'WAITING_REVIEW', 'WAITING_DOC', 'WAITING_APPROVAL', 'CANCELLED']
    if (body.status && ALLOWED_STATUSES.includes(body.status)) data.status = body.status
    if (body.resultNote !== undefined) data.resultNote = body.resultNote
    if (body.resultUrl  !== undefined) data.resultUrl  = body.resultUrl
    if (body.progressNote?.trim()) {
      data.progressNotes = appendProgressNote(task.progressNotes as string | null, body.progressNote.trim())
    }
    if (body.status === 'IN_PROGRESS' && ['NEW', 'ASSIGNED', 'PENDING'].includes(task.status as string)) {
      data.status = 'IN_PROGRESS'
    }
    if (body.status === 'WAITING_REVIEW' || body.status === 'WAITING_APPROVAL') {
      data.submittedAt = new Date()
      await createNotification({
        userId: task.assignedById,
        type: 'TASK_SUBMITTED',
        title: '📤 พนักงานส่งงานแล้ว',
        message: `${session.user.name} ส่งงาน: ${task.title}`,
        link: '/tasks',
      })
    }
    if (body.status === 'CANCELLED') {
      await createNotification({
        userId: task.assignedById,
        type: 'TASK_SUBMITTED',
        title: '🚫 งานถูกยกเลิก',
        message: `${session.user.name} ยกเลิกงาน: ${task.title}`,
        link: '/tasks',
      })
    }
  } else {
    // Reviewer / full admin: can update everything
    if (body.title        !== undefined) data.title       = body.title
    if (body.description  !== undefined) data.description = body.description
    if (body.type         !== undefined) data.type        = body.type
    if (body.priority     !== undefined) data.priority    = body.priority
    if (body.notes        !== undefined) data.notes       = body.notes
    if (body.startDate    !== undefined) data.startDate   = body.startDate ? new Date(body.startDate) : null
    if (body.dueDate      !== undefined) data.dueDate     = body.dueDate   ? new Date(body.dueDate)   : null

    if (body.caseNumber       !== undefined) data.caseNumber       = body.caseNumber?.trim()       ?? null
    if (body.clientName       !== undefined) data.clientName       = body.clientName?.trim()       ?? null
    if (body.taskDepartment   !== undefined) data.taskDepartment   = body.taskDepartment           ?? null
    if (body.appointmentDate  !== undefined) data.appointmentDate  = body.appointmentDate  ? new Date(body.appointmentDate)  : null
    if (body.courtDate        !== undefined) data.courtDate        = body.courtDate        ? new Date(body.courtDate)        : null
    if (body.appointmentPlace !== undefined) data.appointmentPlace = body.appointmentPlace?.trim() ?? null

    if (body.taskLinks !== undefined) {
      if (Array.isArray(body.taskLinks) && body.taskLinks.length > 0) {
        const clean = (body.taskLinks as Record<string, string>[])
          .filter(l => l?.url?.trim())
          .map(l => ({ label: String(l.label ?? '').trim(), url: String(l.url ?? '').trim() }))
        data.taskLinks = clean.length > 0 ? JSON.stringify(clean) : null
      } else {
        data.taskLinks = null
      }
    }

    if (body.progressNote?.trim()) {
      data.progressNotes = appendProgressNote(task.progressNotes as string | null, body.progressNote.trim())
    }

    if (body.status !== undefined) {
      data.status = body.status

      if (body.status === 'COMPLETED') {
        data.reviewedById = userId
        data.reviewedAt   = new Date()
        data.reviewNote   = body.reviewNote ?? null
        await createNotification({
          userId: task.assigneeId,
          type: 'TASK_APPROVED',
          title: '✅ งานได้รับการอนุมัติ',
          message: `งาน "${task.title}" ได้รับการอนุมัติเรียบร้อยแล้ว`,
          link: '/tasks',
        })
      }
      if (body.status === 'REVISION') {
        data.reviewNote = body.reviewNote ?? null
        await createNotification({
          userId: task.assigneeId,
          type: 'TASK_REVISION',
          title: '🔄 งานต้องแก้ไข',
          message: `งาน "${task.title}" ต้องการการแก้ไข${body.reviewNote ? `: ${body.reviewNote}` : ''}`,
          link: '/tasks',
        })
      }
      if (body.status === 'REJECTED') {
        data.reviewNote = body.reviewNote ?? null
        await createNotification({
          userId: task.assigneeId,
          type: 'TASK_REVISION',
          title: '❌ งานถูกปฏิเสธ',
          message: `งาน "${task.title}" ถูกปฏิเสธ${body.reviewNote ? `: ${body.reviewNote}` : ''}`,
          link: '/tasks',
        })
      }
      if (body.status === 'CANCELLED') {
        await createNotification({
          userId: task.assigneeId,
          type: 'TASK_SUBMITTED',
          title: '🚫 งานถูกยกเลิก',
          message: `งาน "${task.title}" ถูกยกเลิก`,
          link: '/tasks',
        })
      }
    }
  }

  const updated = await prisma.taskAssignment.update({
    where: { id },
    data,
    include: fullTaskInclude,
  })

  return NextResponse.json({ task: updated })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const task = await prisma.taskAssignment.findUnique({ where: { id } })
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const canDelete =
    CAN_MANAGE_ALL.includes(session.user.role) ||
    task.assignedById === session.user.id

  if (!canDelete) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.taskAssignment.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
