/**
 * Task Reminder Cron — Phase 2
 * Runs daily at 01:00 UTC (08:00 Bangkok) via Vercel Cron.
 * Sends deadline, overdue, court, appointment, and waiting-doc reminders.
 * Phase 2 extensions: LINE OA push + auto-escalation chain.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createNotification, sendLineMessage } from '@/lib/notifications'
import { getOverdueInfo, getEscalationLevel } from '@/lib/task-sla'
import type { TaskStatus } from '@prisma/client'

// Tasks in these statuses are considered "active" (not finished)
const ACTIVE_STATUSES: TaskStatus[] = [
  'PENDING', 'NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_DOC',
  'WAITING_REVIEW', 'REVISION', 'WAITING_APPROVAL',
]

// Days before a date to send a reminder
const REMINDER_DAYS = [7, 3, 1]

function startOfDayUTC(date: Date): Date {
  const d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

/** Returns the UTC date that is `days` days from today (Bangkok day) */
function targetDate(offsetDays: number): { gte: Date; lte: Date } {
  const bangkokNow = new Date(Date.now() + 7 * 60 * 60 * 1000)
  const target = new Date(bangkokNow)
  target.setUTCDate(target.getUTCDate() + offsetDays)
  const mid = new Date(target)
  mid.setUTCHours(0, 0, 0, 0)
  return {
    gte: new Date(mid.getTime() - 7 * 60 * 60 * 1000),
    lte: new Date(mid.getTime() - 7 * 60 * 60 * 1000 + 86399999),
  }
}

/** Check if a reminder of this type was already sent today for this task/user */
async function alreadySent(userId: string, taskId: string, type: string): Promise<boolean> {
  const since = new Date(Date.now() - 25 * 60 * 60 * 1000)
  const existing = await prisma.notification.findFirst({
    where: { userId, taskId, type: type as never, createdAt: { gte: since } },
    select: { id: true },
  })
  return !!existing
}

/** Send both in-app and LINE OA notification */
async function notifyUser(opts: {
  userId: string
  taskId: string
  type: string
  title: string
  message: string
  link: string
  lineMessage?: string
}) {
  await createNotification({
    userId:  opts.userId,
    taskId:  opts.taskId,
    type:    opts.type as never,
    title:   opts.title,
    message: opts.message,
    link:    opts.link,
  })
  if (opts.lineMessage) {
    await sendLineMessage(opts.userId, opts.lineMessage).catch(() => {})
  }
}

export async function GET(req: NextRequest) {
  // ── Auth guard ──────────────────────────────────────────────────────────
  const isProd = process.env.NODE_ENV === 'production'
  if (isProd) {
    const secret = process.env.CRON_SECRET
    const auth   = req.headers.get('authorization')
    if (!secret || auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const stats = {
    deadline: 0, overdue: 0, court: 0, appointment: 0,
    waitingDoc: 0, escalated: 0, errors: 0,
  }

  // ── 1. Deadline reminders (7d / 3d / 1d before dueDate) ───────────────
  for (const days of REMINDER_DAYS) {
    const range = targetDate(days)
    const tasks = await prisma.taskAssignment.findMany({
      where: {
        status:  { in: ACTIVE_STATUSES },
        dueDate: { gte: range.gte, lte: range.lte },
      },
      select: { id: true, title: true, assigneeId: true, caseNumber: true },
    })
    for (const t of tasks) {
      try {
        if (await alreadySent(t.assigneeId, t.id, 'TASK_DEADLINE_REMINDER')) continue
        const label  = days === 1 ? 'พรุ่งนี้' : `อีก ${days} วัน`
        const prefix = t.caseNumber ? `[${t.caseNumber}] ` : ''
        await notifyUser({
          userId:  t.assigneeId,
          taskId:  t.id,
          type:    'TASK_DEADLINE_REMINDER',
          title:   `⏰ งานใกล้ครบกำหนด (${label})`,
          message: `${prefix}${t.title}`,
          link:    '/tasks',
          lineMessage: days <= 3
            ? `⏰ แจ้งเตือน: งานของคุณใกล้ครบกำหนด${days === 1 ? 'พรุ่งนี้' : `ใน ${days} วัน`}\n\n${prefix}${t.title}\n\nดูรายละเอียดได้ในแอป HRFlow`
            : undefined,
        })
        stats.deadline++
      } catch { stats.errors++ }
    }
  }

  // ── 2. Overdue tasks + LINE OA + Escalation ───────────────────────────
  const now = new Date()
  const overdueTasks = await prisma.taskAssignment.findMany({
    where: {
      status:  { in: ACTIVE_STATUSES },
      dueDate: { lt: startOfDayUTC(now) },
    },
    include: {
      assignee: {
        select: {
          id: true, name: true,
          teamLeaderId: true, managerId: true,
          lineUserId: true,
        },
      },
      assignedBy: { select: { id: true, lineUserId: true } },
    },
  })

  for (const taskRaw of overdueTasks) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = taskRaw as any
    try {
      const overdueInfo = getOverdueInfo(t.dueDate, t.status)
      const daysLate    = overdueInfo.daysLate
      const prefix      = t.caseNumber ? `[${t.caseNumber}] ` : ''
      const dueDateStr  = t.dueDate ? new Date(t.dueDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long' }) : ''

      // Notify assignee (in-app)
      if (!(await alreadySent(t.assigneeId, t.id, 'TASK_OVERDUE'))) {
        await notifyUser({
          userId:  t.assigneeId,
          taskId:  t.id,
          type:    'TASK_OVERDUE',
          title:   '🔴 งานเกินกำหนดแล้ว',
          message: `${prefix}${t.title} (เกิน ${daysLate} วัน)`,
          link:    '/tasks',
          lineMessage: `🔴 งานของคุณเกินกำหนดแล้ว ${daysLate} วัน\n\n${prefix}${t.title}\nกำหนดส่ง: ${dueDateStr}\n\nกรุณาดำเนินการโดยด่วน`,
        })
        stats.overdue++
      }

      // Notify assigner (in-app only)
      if (t.assignedById !== t.assigneeId && !(await alreadySent(t.assignedById, t.id, 'TASK_OVERDUE'))) {
        await notifyUser({
          userId:  t.assignedById,
          taskId:  t.id,
          type:    'TASK_OVERDUE',
          title:   '🔴 งานในทีมเกินกำหนดแล้ว',
          message: `${prefix}${t.title} (เกิน ${daysLate} วัน)`,
          link:    '/tasks',
        })
        stats.overdue++
      }

      // ── Escalation chain ──────────────────────────────────────────────
      const escLevel = getEscalationLevel(daysLate)
      const assignee = t.assignee

      if (escLevel === 'team_leader' && assignee?.teamLeaderId) {
        const tlId = assignee.teamLeaderId
        if (!(await alreadySent(tlId, t.id, 'TASK_OVERDUE'))) {
          await notifyUser({
            userId:  tlId,
            taskId:  t.id,
            type:    'TASK_OVERDUE',
            title:   '⚠️ [Escalate] งานในทีมเกินกำหนด 1 วัน',
            message: `${assignee.name}: ${prefix}${t.title}`,
            link:    '/tasks',
            lineMessage: `⚠️ แจ้งเตือน (หัวหน้าทีม)\n\nงานของ ${assignee.name} เกินกำหนดแล้ว ${daysLate} วัน\n${prefix}${t.title}\n\nกรุณาติดตามผล`,
          })
          stats.escalated++
        }
      }

      if (escLevel === 'manager' && assignee?.managerId) {
        const mgId = assignee.managerId
        if (!(await alreadySent(mgId, t.id, 'TASK_OVERDUE'))) {
          await notifyUser({
            userId:  mgId,
            taskId:  t.id,
            type:    'TASK_OVERDUE',
            title:   '🚨 [Escalate] งานเกินกำหนด 3 วัน',
            message: `${assignee.name}: ${prefix}${t.title}`,
            link:    '/tasks',
            lineMessage: `🚨 แจ้งเตือน (ผู้จัดการ)\n\nงานของ ${assignee.name} เกินกำหนดแล้ว ${daysLate} วัน\n${prefix}${t.title}\n\nต้องการการแก้ไขโดยด่วน`,
          })
          stats.escalated++
        }
      }

      if (escLevel === 'ceo') {
        // Find CEO
        const ceo = await prisma.user.findFirst({
          where: { role: 'CEO', status: 'ACTIVE' },
          select: { id: true },
        })
        if (ceo && !(await alreadySent(ceo.id, t.id, 'TASK_OVERDUE'))) {
          await notifyUser({
            userId:  ceo.id,
            taskId:  t.id,
            type:    'TASK_OVERDUE',
            title:   '🆘 [Critical] งานเกินกำหนด 7+ วัน',
            message: `${assignee?.name}: ${prefix}${t.title}`,
            link:    '/tasks',
            lineMessage: `🆘 Critical Alert\n\nงานของ ${assignee?.name} เกินกำหนดแล้ว ${daysLate} วัน\n${prefix}${t.title}\n\nต้องการการแก้ไขเร่งด่วน`,
          })
          stats.escalated++
        }
      }

      // Log escalation to task timeline
      if (escLevel !== 'none') {
        const escLevelTH = { team_leader: 'หัวหน้าทีม', manager: 'ผู้จัดการ', ceo: 'CEO' }[escLevel]
        await prisma.taskTimeline.create({
          data: {
            taskId:      t.id,
            userId:      t.assignedById,
            action:      'escalated',
            description: `ระบบ Escalate งาน (เกิน ${daysLate} วัน) → แจ้ง${escLevelTH}`,
            meta:        JSON.stringify({ daysLate, escalatedTo: escLevel }),
          },
        }).catch(() => {})
      }
    } catch { stats.errors++ }
  }

  // ── 3. Court date reminders (7d / 3d / 1d before courtDate) ───────────
  for (const days of REMINDER_DAYS) {
    const range = targetDate(days)
    const tasks = await prisma.taskAssignment.findMany({
      where: {
        status:    { in: ACTIVE_STATUSES },
        courtDate: { gte: range.gte, lte: range.lte },
      },
      select: { id: true, title: true, assigneeId: true, caseNumber: true, courtDate: true },
    })
    for (const t of tasks) {
      try {
        if (await alreadySent(t.assigneeId, t.id, 'TASK_COURT_REMINDER')) continue
        const label  = days === 1 ? 'พรุ่งนี้' : `อีก ${days} วัน`
        const prefix = t.caseNumber ? `คดี ${t.caseNumber}` : t.title
        await notifyUser({
          userId:  t.assigneeId,
          taskId:  t.id,
          type:    'TASK_COURT_REMINDER',
          title:   `⚖️ ใกล้ถึงวันนัดศาล (${label})`,
          message: prefix,
          link:    '/tasks',
          lineMessage: days <= 1
            ? `⚖️ แจ้งเตือน: นัดศาล${days === 1 ? 'พรุ่งนี้' : `ใน ${days} วัน`}\n\n${prefix}\n\nอย่าลืมเตรียมเอกสาร`
            : undefined,
        })
        stats.court++
      } catch { stats.errors++ }
    }
  }

  // ── 4. Appointment reminders (7d / 3d / 1d before appointmentDate) ────
  for (const days of REMINDER_DAYS) {
    const range = targetDate(days)
    const tasks = await prisma.taskAssignment.findMany({
      where: {
        status:          { in: ACTIVE_STATUSES },
        appointmentDate: { gte: range.gte, lte: range.lte },
      },
      select: { id: true, title: true, assigneeId: true, caseNumber: true, clientName: true, appointmentPlace: true },
    })
    for (const t of tasks) {
      try {
        if (await alreadySent(t.assigneeId, t.id, 'TASK_APPOINTMENT_REMINDER')) continue
        const label = days === 1 ? 'พรุ่งนี้' : `อีก ${days} วัน`
        const who   = t.clientName ? `ลูกค้า: ${t.clientName}` : t.title
        const place = t.appointmentPlace ? ` ที่ ${t.appointmentPlace}` : ''
        await notifyUser({
          userId:  t.assigneeId,
          taskId:  t.id,
          type:    'TASK_APPOINTMENT_REMINDER',
          title:   `📅 ใกล้ถึงวันนัดหมาย (${label})`,
          message: `${who}${place}`,
          link:    '/tasks',
          lineMessage: days <= 1
            ? `📅 แจ้งเตือน: นัดหมาย${days === 1 ? 'พรุ่งนี้' : `ใน ${days} วัน`}\n\n${who}${place}\n\nอย่าลืมเตรียมตัว`
            : undefined,
        })
        stats.appointment++
      } catch { stats.errors++ }
    }
  }

  // ── 5. Waiting-document reminder (WAITING_DOC for > 1 day) ────────────
  const waitingCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const waitingTasks = await prisma.taskAssignment.findMany({
    where: {
      status:    'WAITING_DOC' as TaskStatus,
      updatedAt: { lt: waitingCutoff },
    },
    select: { id: true, title: true, assignedById: true, caseNumber: true },
  })
  for (const t of waitingTasks) {
    try {
      if (await alreadySent(t.assignedById, t.id, 'TASK_WAITING_DOC')) continue
      const prefix = t.caseNumber ? `[${t.caseNumber}] ` : ''
      await notifyUser({
        userId:  t.assignedById,
        taskId:  t.id,
        type:    'TASK_WAITING_DOC',
        title:   '📄 งานยังรอเอกสารอยู่',
        message: `${prefix}${t.title}`,
        link:    '/tasks',
      })
      stats.waitingDoc++
    } catch { stats.errors++ }
  }

  // ── 6. Automation rules (from DB) ────────────────────────────────────────
  try {
    const rules = await prisma.taskAutomationRule.findMany({ where: { isActive: true } })

    for (const rule of rules) {
      const conditions = JSON.parse(rule.conditions) as Record<string, unknown>

      if (rule.triggerOn === 'OVERDUE') {
        // Rule: overdue > N days AND optionally priority match → action
        const minDays     = Number(conditions.minDaysLate ?? 1)
        const priorities  = (conditions.priorities as string[] | undefined) ?? []
        const cutoff      = new Date(now.getTime() - minDays * 86400000)

        const matchTasks = await prisma.taskAssignment.findMany({
          where: {
            status:  { in: ACTIVE_STATUSES },
            dueDate: { lt: cutoff },
            ...(priorities.length > 0 ? { priority: { in: priorities as never[] } } : {}),
            ...(rule.department ? { taskDepartment: rule.department } : {}),
          },
          select: { id: true, title: true, assigneeId: true, assignedById: true, caseNumber: true },
          take: 50,
        })

        for (const t of matchTasks) {
          try {
            if (await alreadySent(t.assignedById, t.id, 'TASK_AUTOMATION_TRIGGERED')) continue
            const actionData = JSON.parse(rule.actionData) as Record<string, string>
            const prefix     = t.caseNumber ? `[${t.caseNumber}] ` : ''
            await notifyUser({
              userId:      t.assignedById,
              taskId:      t.id,
              type:        'TASK_AUTOMATION_TRIGGERED',
              title:       `🤖 ${rule.name}`,
              message:     `${prefix}${t.title}`,
              link:        '/tasks',
              lineMessage: actionData.lineMessage
                ? actionData.lineMessage.replace('{title}', t.title).replace('{prefix}', prefix)
                : undefined,
            })
            stats.escalated++
          } catch { stats.errors++ }
        }
      }

      if (rule.triggerOn === 'REJECTED_COUNT') {
        const minCount = Number(conditions.minCount ?? 3)
        const rejectTasks = await prisma.taskAssignment.findMany({
          where: {
            rejectedCount: { gte: minCount },
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
            ...(rule.department ? { taskDepartment: rule.department } : {}),
          },
          select: { id: true, title: true, assignedById: true, rejectedCount: true, caseNumber: true },
          take: 20,
        })
        for (const t of rejectTasks) {
          try {
            if (await alreadySent(t.assignedById, t.id, 'TASK_AUTOMATION_TRIGGERED')) continue
            const prefix = t.caseNumber ? `[${t.caseNumber}] ` : ''
            await notifyUser({
              userId:  t.assignedById,
              taskId:  t.id,
              type:    'TASK_AUTOMATION_TRIGGERED',
              title:   `🤖 ${rule.name} (ปฏิเสธ ${t.rejectedCount}x)`,
              message: `${prefix}${t.title}`,
              link:    '/tasks',
            })
            stats.escalated++
          } catch { stats.errors++ }
        }
      }
    }
  } catch { stats.errors++ }

  // ── 7. Dependency unblock notifications ────────────────────────────────────
  try {
    // Find tasks that recently became unblocked (all dependencies now COMPLETED)
    const completedSince = new Date(now.getTime() - 25 * 60 * 60 * 1000)
    const recentlyCompleted = await prisma.taskAssignment.findMany({
      where: { status: 'COMPLETED', reviewedAt: { gte: completedSince } },
      select: { id: true },
    })
    if (recentlyCompleted.length > 0) {
      const completedIds = recentlyCompleted.map((t) => t.id)
      // Find tasks that depended on these, now check if all their deps are done
      const waitingDependents = await prisma.taskDependency.findMany({
        where: { dependsOnId: { in: completedIds } },
        include: {
          task: {
            select: { id: true, title: true, assigneeId: true, status: true },
            include: { dependencies: { include: { dependsOn: { select: { status: true } } } } },
          },
        },
      })
      for (const dep of waitingDependents) {
        const t = dep.task as typeof dep.task & { dependencies: { dependsOn: { status: string } }[] }
        if (['COMPLETED', 'CANCELLED', 'REJECTED'].includes(t.status)) continue
        const allDone = (t.dependencies ?? []).every((d: { dependsOn: { status: string } }) => d.dependsOn.status === 'COMPLETED')
        if (!allDone) continue
        if (await alreadySent(t.assigneeId, t.id, 'TASK_DEPENDENCY_UNBLOCKED')) continue
        await notifyUser({
          userId:      t.assigneeId,
          taskId:      t.id,
          type:        'TASK_DEPENDENCY_UNBLOCKED',
          title:       '🔓 งานของคุณพร้อมเริ่มแล้ว',
          message:     `"${t.title}" — งานที่รอผ่านแล้ว สามารถเริ่มดำเนินการได้`,
          link:        '/tasks',
          lineMessage: `🔓 งานของคุณพร้อมเริ่มแล้ว\n\n"${t.title}"\n\nงานที่ต้องทำก่อนหน้าเสร็จสิ้นแล้ว ดำเนินการได้เลย`,
        })
      }
    }
  } catch { stats.errors++ }

  console.log('[task-reminders]', stats)
  return NextResponse.json({ ok: true, stats })
}
