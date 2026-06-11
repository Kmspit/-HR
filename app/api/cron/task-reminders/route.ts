/**
 * Task Reminder Cron — Phase 2
 * Runs daily at 01:00 UTC (08:00 Bangkok) via Vercel Cron.
 * Sends deadline, overdue, court, appointment, and waiting-doc reminders.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'
import type { TaskStatus } from '@prisma/client'

// Tasks in these statuses are considered "active" (not finished)
const ACTIVE_STATUSES: TaskStatus[] = ['PENDING', 'NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_DOC', 'WAITING_REVIEW', 'REVISION']

// Days before a date to send a reminder
const REMINDER_DAYS = [7, 3, 1]

function startOfDayUTC(date: Date): Date {
  const d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function endOfDayUTC(date: Date): Date {
  const d = new Date(date)
  d.setUTCHours(23, 59, 59, 999)
  return d
}

/** Returns the UTC date that is `days` days from today (Bangkok day) */
function targetDate(offsetDays: number): { gte: Date; lte: Date } {
  // Bangkok is UTC+7. "today" in Bangkok = UTC now + 7h, floor to date
  const bangkokNow = new Date(Date.now() + 7 * 60 * 60 * 1000)
  // Add offset days
  const target = new Date(bangkokNow)
  target.setUTCDate(target.getUTCDate() + offsetDays)
  // Build a UTC range that covers the full Bangkok calendar day
  // Bangkok midnight = UTC 17:00 previous day, so we use a ±12h window
  const mid = new Date(target)
  mid.setUTCHours(0, 0, 0, 0)
  return {
    gte: new Date(mid.getTime() - 7 * 60 * 60 * 1000),          // UTC 17:00 day-1
    lte: new Date(mid.getTime() - 7 * 60 * 60 * 1000 + 86399999), // UTC 16:59:59 same day
  }
}

/** Check if a reminder of this type was already sent today for this task/user */
async function alreadySent(userId: string, taskId: string, type: string): Promise<boolean> {
  const since = new Date(Date.now() - 25 * 60 * 60 * 1000) // 25h window (safe daily dedup)
  const existing = await prisma.notification.findFirst({
    where: { userId, taskId, type: type as never, createdAt: { gte: since } },
    select: { id: true },
  })
  return !!existing
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

  const stats = { deadline: 0, overdue: 0, court: 0, appointment: 0, waitingDoc: 0, errors: 0 }

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
        const label = days === 1 ? 'พรุ่งนี้' : `อีก ${days} วัน`
        const prefix = t.caseNumber ? `[${t.caseNumber}] ` : ''
        await createNotification({
          userId:  t.assigneeId,
          taskId:  t.id,
          type:    'TASK_DEADLINE_REMINDER',
          title:   `⏰ งานใกล้ครบกำหนด (${label})`,
          message: `${prefix}${t.title}`,
          link:    '/tasks',
        })
        stats.deadline++
      } catch { stats.errors++ }
    }
  }

  // ── 2. Overdue tasks ───────────────────────────────────────────────────
  const now = new Date()
  const overdueTasks = await prisma.taskAssignment.findMany({
    where: {
      status:  { in: ACTIVE_STATUSES },
      dueDate: { lt: startOfDayUTC(now) },
    },
    select: { id: true, title: true, assigneeId: true, assignedById: true, caseNumber: true },
  })
  for (const t of overdueTasks) {
    try {
      if (!(await alreadySent(t.assigneeId, t.id, 'TASK_OVERDUE'))) {
        const prefix = t.caseNumber ? `[${t.caseNumber}] ` : ''
        await createNotification({
          userId:  t.assigneeId,
          taskId:  t.id,
          type:    'TASK_OVERDUE',
          title:   '🔴 งานเกินกำหนดแล้ว',
          message: `${prefix}${t.title}`,
          link:    '/tasks',
        })
        stats.overdue++
      }
      // Also notify the assigner
      if (t.assignedById !== t.assigneeId && !(await alreadySent(t.assignedById, t.id, 'TASK_OVERDUE'))) {
        const prefix = t.caseNumber ? `[${t.caseNumber}] ` : ''
        await createNotification({
          userId:  t.assignedById,
          taskId:  t.id,
          type:    'TASK_OVERDUE',
          title:   '🔴 งานในทีมเกินกำหนดแล้ว',
          message: `${prefix}${t.title}`,
          link:    '/tasks',
        })
        stats.overdue++
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
        await createNotification({
          userId:  t.assigneeId,
          taskId:  t.id,
          type:    'TASK_COURT_REMINDER',
          title:   `⚖️ ใกล้ถึงวันนัดศาล (${label})`,
          message: prefix,
          link:    '/tasks',
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
        const label   = days === 1 ? 'พรุ่งนี้' : `อีก ${days} วัน`
        const who     = t.clientName ? `ลูกค้า: ${t.clientName}` : t.title
        const place   = t.appointmentPlace ? ` ที่ ${t.appointmentPlace}` : ''
        await createNotification({
          userId:  t.assigneeId,
          taskId:  t.id,
          type:    'TASK_APPOINTMENT_REMINDER',
          title:   `📅 ใกล้ถึงวันนัดหมาย (${label})`,
          message: `${who}${place}`,
          link:    '/tasks',
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
      await createNotification({
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

  console.log('[task-reminders]', stats)
  return NextResponse.json({ ok: true, stats })
}
