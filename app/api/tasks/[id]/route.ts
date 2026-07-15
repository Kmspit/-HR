import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse, after } from 'next/server'
import { createNotification, sendLineMessage } from '@/lib/notifications'
import { apiError } from '@/lib/api-handler'

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
  timeline: {
    select: {
      id: true, action: true, description: true, meta: true, createdAt: true,
      user: { select: { id: true, name: true, role: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const

// Map Thai status labels for timeline descriptions
const STATUS_TH: Record<string, string> = {
  PENDING:          'รอดำเนินการ',
  NEW:              'งานใหม่',
  ASSIGNED:         'มอบหมายแล้ว',
  IN_PROGRESS:      'กำลังดำเนินการ',
  WAITING_DOC:      'รอเอกสาร',
  WAITING_REVIEW:   'รอตรวจสอบ',
  WAITING_APPROVAL: 'รออนุมัติ',
  REVISION:         'แก้ไข',
  COMPLETED:        'เสร็จสิ้น',
  REJECTED:         'ปฏิเสธ',
  CANCELLED:        'ยกเลิก',
  OVERDUE:          'เกินกำหนด',
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
 try {
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
} catch (err) {
  return apiError(err)
 }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
 try {
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

  const data: Record<string, unknown> = {}
  const timelineEntries: { action: string; description: string; meta?: string }[] = []

  function appendProgressNote(existing: string | null, note: string): string {
    const arr: { note: string; timestamp: string; userId: string; userName: string }[] =
      existing ? JSON.parse(existing) : []
    arr.push({ note, timestamp: new Date().toISOString(), userId, userName })
    return JSON.stringify(arr)
  }

  if (isAssignee && !isReviewer && !isFullAdmin) {
    // Employee: can update progress, submit result, cancel own task
    const ALLOWED_STATUSES = ['IN_PROGRESS', 'WAITING_REVIEW', 'WAITING_DOC', 'WAITING_APPROVAL', 'CANCELLED']
    if (body.status && ALLOWED_STATUSES.includes(body.status)) {
      // Dependency check: block IN_PROGRESS if prerequisites not completed
      if (body.status === 'IN_PROGRESS') {
        const blockedDep = await prisma.taskDependency.findFirst({
          where: { taskId: id, dependsOn: { status: { notIn: ['COMPLETED'] } } },
          include: { dependsOn: { select: { title: true, status: true } } },
        })
        if (blockedDep) {
          return NextResponse.json({
            error: `ไม่สามารถเริ่มงานได้ เนื่องจากยังรองานก่อนหน้า: "${(blockedDep as { dependsOn: { title: string } }).dependsOn.title}"`,
          }, { status: 409 })
        }
      }
      const oldStatus = task.status as string
      data.status = body.status
      timelineEntries.push({
        action: 'status_changed',
        description: `${userName} เปลี่ยนสถานะจาก "${STATUS_TH[oldStatus] ?? oldStatus}" เป็น "${STATUS_TH[body.status] ?? body.status}"`,
        meta: JSON.stringify({ oldStatus, newStatus: body.status }),
      })
    }
    if (body.resultNote !== undefined) data.resultNote = body.resultNote
    if (body.resultUrl  !== undefined) data.resultUrl  = body.resultUrl
    if (body.progressNote?.trim()) {
      data.progressNotes = appendProgressNote(task.progressNotes as string | null, body.progressNote.trim())
      timelineEntries.push({
        action: 'edited',
        description: `${userName} เพิ่มบันทึกความคืบหน้า`,
      })
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
    const oldStatus = task.status as string

    if (body.title        !== undefined) {
      if (body.title !== task.title) {
        timelineEntries.push({ action: 'edited', description: `${userName} แก้ไขชื่องาน`, meta: JSON.stringify({ field: 'title', oldValue: task.title, newValue: body.title }) })
      }
      data.title = body.title
    }
    if (body.description  !== undefined) data.description = body.description
    if (body.type         !== undefined) data.type        = body.type
    if (body.priority     !== undefined) {
      if (body.priority !== task.priority) {
        timelineEntries.push({ action: 'edited', description: `${userName} เปลี่ยนความสำคัญ`, meta: JSON.stringify({ field: 'priority', oldValue: task.priority, newValue: body.priority }) })
      }
      data.priority = body.priority
    }
    if (body.notes        !== undefined) data.notes       = body.notes
    if (body.startDate    !== undefined) data.startDate   = body.startDate ? new Date(body.startDate) : null
    if (body.dueDate      !== undefined) {
      if (body.dueDate !== (task.dueDate ? task.dueDate.toISOString() : null)) {
        timelineEntries.push({ action: 'edited', description: `${userName} แก้ไขกำหนดส่ง`, meta: JSON.stringify({ field: 'dueDate', newValue: body.dueDate }) })
      }
      data.dueDate = body.dueDate ? new Date(body.dueDate) : null
    }
    if (body.dueTime      !== undefined) data.dueTime     = body.dueTime?.trim() ?? null
    if (body.slaHours     !== undefined) data.slaHours    = body.slaHours ? Number(body.slaHours) : null
    if (body.debtorId     !== undefined) data.debtorId    = body.debtorId ?? null

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
      timelineEntries.push({ action: 'edited', description: `${userName} เพิ่มบันทึกความคืบหน้า` })
    }

    if (body.status !== undefined) {
      data.status = body.status
      timelineEntries.push({
        action: 'status_changed',
        description: `${userName} เปลี่ยนสถานะจาก "${STATUS_TH[oldStatus] ?? oldStatus}" เป็น "${STATUS_TH[body.status] ?? body.status}"`,
        meta: JSON.stringify({ oldStatus, newStatus: body.status }),
      })

      if (body.status === 'COMPLETED') {
        data.reviewedById = userId
        data.reviewedAt   = new Date()
        data.reviewNote   = body.reviewNote ?? null
        // Notification + LINE push don't gate the response — fire after the
        // task update (and its timeline entry) below has actually committed.
        after(() => {
          createNotification({
            userId: task.assigneeId,
            type: 'TASK_APPROVED',
            title: '✅ งานได้รับการอนุมัติ',
            message: `งาน "${task.title}" ได้รับการอนุมัติเรียบร้อยแล้ว`,
            link: '/tasks',
          })
          sendLineMessage(
            task.assigneeId,
            `✅ งานของคุณได้รับการอนุมัติ\n\n"${task.title}"\nอนุมัติโดย: ${userName}`,
          ).catch(() => {})
        })
      }
      if (body.status === 'REVISION') {
        data.reviewNote = body.reviewNote ?? null
        after(() => {
          createNotification({
            userId: task.assigneeId,
            type: 'TASK_REVISION',
            title: '🔄 งานต้องแก้ไข',
            message: `งาน "${task.title}" ต้องการการแก้ไข${body.reviewNote ? `: ${body.reviewNote}` : ''}`,
            link: '/tasks',
          })
          sendLineMessage(
            task.assigneeId,
            `🔄 งานของคุณต้องการการแก้ไข\n\n"${task.title}"${body.reviewNote ? `\nหมายเหตุ: ${body.reviewNote}` : ''}`,
          ).catch(() => {})
        })
      }
      if (body.status === 'REJECTED') {
        data.reviewNote    = body.reviewNote ?? null
        data.rejectedCount = (task.rejectedCount ?? 0) + 1
        after(() => {
          createNotification({
            userId: task.assigneeId,
            type: 'TASK_REVISION',
            title: '❌ งานถูกปฏิเสธ',
            message: `งาน "${task.title}" ถูกปฏิเสธ${body.reviewNote ? `: ${body.reviewNote}` : ''}`,
            link: '/tasks',
          })
          sendLineMessage(
            task.assigneeId,
            `❌ งานถูกปฏิเสธ\n\n"${task.title}"${body.reviewNote ? `\nเหตุผล: ${body.reviewNote}` : ''}`,
          ).catch(() => {})
        })
        // Automation rule: 3+ rejections → notify CEO
        if ((task.rejectedCount ?? 0) + 1 >= 3) {
          const ceo = await prisma.user.findFirst({
            where: { role: 'CEO', status: 'ACTIVE' },
            select: { id: true },
          })
          if (ceo) {
            const ceoId = ceo.id
            const rejectedCount = (task.rejectedCount ?? 0) + 1
            after(() => {
              createNotification({
                userId:  ceoId,
                type:    'TASK_AUTOMATION_TRIGGERED' as never,
                title:   '⚠️ งานถูกปฏิเสธซ้ำ 3+ ครั้ง',
                message: `งาน "${task.title}" ถูกปฏิเสธแล้ว ${rejectedCount} ครั้ง`,
                link:    '/tasks',
              })
              sendLineMessage(
                ceoId,
                `⚠️ แจ้งเตือน: งานถูกปฏิเสธซ้ำ\n\n"${task.title}"\nถูกปฏิเสธแล้ว ${rejectedCount} ครั้ง\n\nต้องการการแก้ไขเร่งด่วน`,
              ).catch(() => {})
            })
          }
          // Log to timeline
          timelineEntries.push({
            action:      'escalated',
            description: `ระบบแจ้งเตือน CEO: งานถูกปฏิเสธ ${(task.rejectedCount ?? 0) + 1} ครั้ง`,
            meta:        JSON.stringify({ rejectedCount: (task.rejectedCount ?? 0) + 1, escalatedTo: 'ceo' }),
          })
        }
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

  // Write all timeline entries
  if (timelineEntries.length > 0) {
    await prisma.taskTimeline.createMany({
      data: timelineEntries.map(e => ({
        taskId:      id,
        userId:      userId,
        action:      e.action,
        description: e.description,
        meta:        e.meta ?? null,
      })),
    })
  }

  return NextResponse.json({ task: updated })
} catch (err) {
  return apiError(err)
 }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
 try {
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
} catch (err) {
  return apiError(err)
 }
}
