/**
 * LINE Notification Dispatcher — Phase 14
 * Respects per-user notification settings (lineNotifSettings).
 * All functions are fire-and-forget safe — they never throw.
 */
import { prisma } from '@/lib/prisma'
import { pushLineMessages } from '@/lib/line-api'
import type { TaskStatus } from '@prisma/client'
import {
  buildApprovalFlex,
  buildTaskNotifyFlex,
  buildCalendarReminderFlex,
  buildDailySummaryFlex,
} from '@/lib/line-flex'

// ─── Notification settings ────────────────────────────────────────────────────

export type LineNotifSettings = {
  muteWeekend: boolean
  muteAfterHours: boolean
  muteStart: string  // "HH:MM"
  muteEnd: string    // "HH:MM"
  mutedTypes: string[]
}

const DEFAULT_SETTINGS: LineNotifSettings = {
  muteWeekend: false,
  muteAfterHours: false,
  muteStart: '21:00',
  muteEnd: '08:00',
  mutedTypes: [],
}

function parseSettings(raw: string | null): LineNotifSettings {
  if (!raw) return DEFAULT_SETTINGS
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<LineNotifSettings>) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function isMutedNow(settings: LineNotifSettings): boolean {
  const now = new Date()
  // Bangkok UTC+7
  const bangkokMs = now.getTime() + 7 * 3600_000
  const bangkokDate = new Date(bangkokMs)
  const dow = bangkokDate.getUTCDay() // 0=Sun, 6=Sat

  if (settings.muteWeekend && (dow === 0 || dow === 6)) return true

  if (settings.muteAfterHours) {
    const hh = bangkokDate.getUTCHours()
    const mm = bangkokDate.getUTCMinutes()
    const cur = hh * 60 + mm
    const [sh, sm] = settings.muteStart.split(':').map(Number)
    const [eh, em] = settings.muteEnd.split(':').map(Number)
    const start = (sh ?? 21) * 60 + (sm ?? 0)
    const end   = (eh ?? 8)  * 60 + (em ?? 0)
    if (start > end) {
      if (cur >= start || cur < end) return true
    } else {
      if (cur >= start && cur < end) return true
    }
  }

  return false
}

async function shouldSend(userId: string, notifType?: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lineUserId: true, lineNotifSettings: true },
  })
  if (!user?.lineUserId) return null

  const settings = parseSettings(user.lineNotifSettings)
  if (isMutedNow(settings)) return null
  if (notifType && settings.mutedTypes.includes(notifType)) return null

  return user.lineUserId
}

// ─── Approval request ─────────────────────────────────────────────────────────

type ApprovalType = 'LEAVE' | 'EXPENSE' | 'OUTSIDE' | 'FORGOT_SCAN'

export async function sendLineApprovalRequest(params: {
  approvalType: ApprovalType
  id: string
  title: string
  requesterName: string
  details: Array<{ label: string; value: string }>
}): Promise<void> {
  try {
    // Find all active approvers with lineUserId
    const approvers = await prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        role: { in: ['CEO', 'SUPER_ADMIN', 'MANAGER_HR', 'HR', 'ADMIN'] },
        lineUserId: { not: null },
      },
      select: { lineUserId: true, lineNotifSettings: true },
    })

    const flex = buildApprovalFlex(params)

    for (const approver of approvers) {
      if (!approver.lineUserId) continue
      const settings = parseSettings(approver.lineNotifSettings)
      if (isMutedNow(settings)) continue
      if (settings.mutedTypes.includes('APPROVAL')) continue
      await pushLineMessages(approver.lineUserId, [flex]).catch(() => {})
    }
  } catch (err) {
    console.error('[sendLineApprovalRequest]', err)
  }
}

// ─── Task notification ────────────────────────────────────────────────────────

export async function sendLineTaskNotify(params: {
  userId: string
  taskTitle: string
  caseNumber?: string | null
  deadline?: string | null
  priority: string
  notifType: 'ASSIGNED' | 'DEADLINE' | 'OVERDUE'
  appUrl?: string
}): Promise<void> {
  try {
    const lineUserId = await shouldSend(params.userId, `TASK_${params.notifType}`)
    if (!lineUserId) return
    const flex = buildTaskNotifyFlex({
      title: params.taskTitle,
      caseNumber: params.caseNumber,
      deadline: params.deadline,
      priority: params.priority,
      notifType: params.notifType,
      appUrl: params.appUrl,
    })
    await pushLineMessages(lineUserId, [flex]).catch(() => {})
  } catch (err) {
    console.error('[sendLineTaskNotify]', err)
  }
}

// ─── Calendar reminder ────────────────────────────────────────────────────────

export async function sendLineCalendarReminder(params: {
  userId: string
  title: string
  eventType: string
  startAt: string
  location?: string | null
  caseNumber?: string | null
  courtName?: string | null
  daysUntil: number
}): Promise<void> {
  try {
    const lineUserId = await shouldSend(params.userId, 'CALENDAR')
    if (!lineUserId) return
    const flex = buildCalendarReminderFlex(params)
    await pushLineMessages(lineUserId, [flex]).catch(() => {})
  } catch (err) {
    console.error('[sendLineCalendarReminder]', err)
  }
}

// ─── CEO daily summary broadcast ─────────────────────────────────────────────

export async function broadcastLineDailySummary(): Promise<{ sent: number; errors: number }> {
  let sent = 0
  let errors = 0

  try {
    // Build summary stats
    const now = new Date()
    const bangkokNow = new Date(now.getTime() + 7 * 3600_000)
    const todayStart = new Date(Date.UTC(bangkokNow.getUTCFullYear(), bangkokNow.getUTCMonth(), bangkokNow.getUTCDate()))
    const todayEnd   = new Date(todayStart.getTime() + 86400_000 - 1)
    const in7        = new Date(now.getTime() + 7 * 86400_000)

    const ACTIVE: TaskStatus[] = ['PENDING', 'NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_DOC', 'WAITING_REVIEW', 'REVISION']

    const [newTasks, overdueTasks, courtIn7, pendingLeave, todayPayments] = await Promise.all([
      prisma.taskAssignment.count({ where: { status: { in: ['NEW', 'ASSIGNED'] as TaskStatus[] }, createdAt: { gte: todayStart, lte: todayEnd } } }),
      prisma.taskAssignment.count({ where: { status: 'OVERDUE' } }),
      prisma.taskAssignment.count({ where: { courtDate: { gte: now, lte: in7 }, status: { in: ACTIVE } } }),
      prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
      prisma.paymentAppointment.count({ where: { appointDate: { gte: todayStart, lte: todayEnd }, status: { not: 'CANCELLED' } } }),
    ])

    const absentToday = 0 // Not touching attendance logic

    const dateStr = bangkokNow.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    const flex = buildDailySummaryFlex({ date: dateStr, newTasks, overdueTasks, courtIn7, absentToday, pendingLeave, todayPayments })

    const recipients = await prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        role: { in: ['CEO', 'SUPER_ADMIN'] },
        lineUserId: { not: null },
      },
      select: { lineUserId: true, lineNotifSettings: true },
    })

    for (const r of recipients) {
      if (!r.lineUserId) continue
      const settings = parseSettings(r.lineNotifSettings)
      if (settings.mutedTypes.includes('DAILY_SUMMARY')) continue
      const result = await pushLineMessages(r.lineUserId, [flex]).catch(() => ({ ok: false }))
      if (result.ok) sent++; else errors++
    }
  } catch (err) {
    console.error('[broadcastLineDailySummary]', err)
    errors++
  }

  return { sent, errors }
}
