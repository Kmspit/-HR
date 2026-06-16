import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createNotification, notifyRole, sendLineMessage } from '@/lib/notifications'

// Court calendar event types handled by THIS cron only.
// The existing /api/cron/calendar-reminders handles: COURT / CLIENT / DEBTOR / INTERNAL
// This cron handles the new legal event types added for the Court Calendar module.
const COURT_EVENT_TYPES = [
  'COURT_APPOINTMENT', 'FILING', 'MEDIATION', 'HEARING',
  'JUDGEMENT', 'ENFORCEMENT', 'CLIENT_MEETING', 'LEGAL_DEADLINE', 'OTHER',
]

const TYPE_LABEL: Record<string, string> = {
  COURT_APPOINTMENT: 'นัดศาล',
  FILING:            'ยื่นเอกสาร',
  MEDIATION:         'ไกล่เกลี่ย',
  HEARING:           'สืบพยาน',
  JUDGEMENT:         'พิพากษา',
  ENFORCEMENT:       'บังคับคดี',
  CLIENT_MEETING:    'ประชุมลูกค้า',
  LEGAL_DEADLINE:    'กำหนดส่ง',
  OTHER:             'นัดหมาย',
}

const REMINDER_OFFSETS_DAYS = [7, 3, 1, 0]

// Events past this threshold but still SCHEDULED are considered MISSED
const MISS_GRACE_MINUTES = 60

export async function GET() {
  const now = new Date()
  let sent   = 0
  let missed = 0

  // ── 1. Reminder notifications ─────────────────────────────────────────────

  for (const daysAhead of REMINDER_OFFSETS_DAYS) {
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead)
    const dayEnd   = new Date(dayStart.getTime() + 86_400_000 - 1)

    const events = await prisma.calendarEvent.findMany({
      where: {
        startAt:    { gte: dayStart, lte: dayEnd },
        status:     'SCHEDULED',
        reminderEnabled: true,
        eventType:  { in: COURT_EVENT_TYPES },
      },
      select: {
        id: true, title: true, eventType: true,
        courtName: true, caseNumber: true, startTime: true,
        caseId: true, priority: true,
        createdById: true,
        assignedLawyerId: true, assignedEmployeeId: true,
      },
    })

    for (const ev of events) {
      const label    = daysAhead === 0 ? 'วันนี้' : daysAhead === 1 ? 'พรุ่งนี้' : `อีก ${daysAhead} วัน`
      const typeStr  = TYPE_LABEL[ev.eventType] ?? 'นัดหมาย'
      const courtStr = ev.courtName ? ` — ${ev.courtName}` : ''
      const caseStr  = ev.caseNumber ? ` [${ev.caseNumber}]` : ''
      const timeStr  = ev.startTime ? ` เวลา ${ev.startTime}` : ''

      const title   = `⚖️ แจ้งเตือน${typeStr} ${label}`
      const message = `${ev.title}${courtStr}${caseStr}${timeStr}`
      const link    = ev.caseId ? `/cases/${ev.caseId}` : '/court-calendar'

      // Notify recipients: creator, assigned lawyer, assigned employee (dedup)
      const recipientIds = new Set<string>([ev.createdById])
      if (ev.assignedLawyerId)   recipientIds.add(ev.assignedLawyerId)
      if (ev.assignedEmployeeId) recipientIds.add(ev.assignedEmployeeId)

      for (const userId of recipientIds) {
        void createNotification({ userId, type: 'CALENDAR_REMINDER', title, message, link })
        // LINE OA — only same-day and 1-day reminders go to LINE to avoid noise
        if (daysAhead <= 1) {
          void sendLineMessage(userId, `${title}\n${message}`)
        }
      }

      // Critical events also notify CEO on same-day
      if (daysAhead === 0 && ev.priority === 'CRITICAL') {
        void notifyRole('CEO', 'CALENDAR_REMINDER', `🚨 วิกฤต: ${typeStr}วันนี้`, message, link)
      }

      sent++
    }
  }

  // ── 2. 1-hour before reminders (same run, checked on exact minute) ────────

  const oneHourFrom = new Date(now.getTime() + 60 * 60 * 1000)
  const oneHourWindow = new Date(now.getTime() + 65 * 60 * 1000) // 5 min window

  const imminentEvents = await prisma.calendarEvent.findMany({
    where: {
      startAt: { gte: oneHourFrom, lte: oneHourWindow },
      status: 'SCHEDULED',
      reminderEnabled: true,
      eventType: { in: COURT_EVENT_TYPES },
    },
    select: {
      id: true, title: true, eventType: true,
      courtName: true, caseNumber: true, startTime: true,
      caseId: true,
      createdById: true,
      assignedLawyerId: true, assignedEmployeeId: true,
    },
  })

  for (const ev of imminentEvents) {
    const typeStr  = TYPE_LABEL[ev.eventType] ?? 'นัดหมาย'
    const courtStr = ev.courtName ? ` — ${ev.courtName}` : ''
    const caseStr  = ev.caseNumber ? ` [${ev.caseNumber}]` : ''

    const title   = `⏰ ${typeStr}อีก 1 ชั่วโมง`
    const message = `${ev.title}${courtStr}${caseStr}`
    const link    = ev.caseId ? `/cases/${ev.caseId}` : '/court-calendar'

    const recipientIds = new Set<string>([ev.createdById])
    if (ev.assignedLawyerId)   recipientIds.add(ev.assignedLawyerId)
    if (ev.assignedEmployeeId) recipientIds.add(ev.assignedEmployeeId)

    for (const userId of recipientIds) {
      void createNotification({ userId, type: 'CALENDAR_REMINDER', title, message, link })
      void sendLineMessage(userId, `${title}\n${message}`)
    }
    sent++
  }

  // ── 3. Auto-mark MISSED + escalate ───────────────────────────────────────

  const graceCutoff = new Date(now.getTime() - MISS_GRACE_MINUTES * 60 * 1000)

  const overdueEvents = await prisma.calendarEvent.findMany({
    where: {
      startAt:   { lt: graceCutoff },
      status:    'SCHEDULED',
      eventType: { in: COURT_EVENT_TYPES },
    },
    select: {
      id: true, title: true, eventType: true, priority: true,
      courtName: true, caseNumber: true,
      caseId: true,
      createdById: true,
      assignedLawyerId: true, assignedEmployeeId: true,
    },
  })

  if (overdueEvents.length > 0) {
    const ids = overdueEvents.map(e => e.id)
    await prisma.calendarEvent.updateMany({
      where: { id: { in: ids } },
      data:  { status: 'MISSED' },
    })

    for (const ev of overdueEvents) {
      const typeStr  = TYPE_LABEL[ev.eventType] ?? 'นัดหมาย'
      const courtStr = ev.courtName ? ` — ${ev.courtName}` : ''
      const caseStr  = ev.caseNumber ? ` [${ev.caseNumber}]` : ''
      const link     = ev.caseId ? `/cases/${ev.caseId}` : '/court-calendar'
      const message  = `${ev.title}${courtStr}${caseStr}`

      // Notify creator and assigned
      const recipientIds = new Set<string>([ev.createdById])
      if (ev.assignedLawyerId)   recipientIds.add(ev.assignedLawyerId)
      if (ev.assignedEmployeeId) recipientIds.add(ev.assignedEmployeeId)

      for (const userId of recipientIds) {
        void createNotification({
          userId, type: 'CALENDAR_REMINDER',
          title: `⚠️ พลาด${typeStr}`, message, link,
        })
        void sendLineMessage(userId, `⚠️ พลาด${typeStr}\n${message}`)
      }

      // Escalate high-priority misses to MANAGER + CEO
      if (ev.priority === 'HIGH' || ev.priority === 'CRITICAL') {
        void notifyRole('MANAGER', 'CALENDAR_REMINDER', `🚨 พลาด${typeStr} (${ev.priority})`, message, link)
        void notifyRole('CEO',     'CALENDAR_REMINDER', `🚨 พลาด${typeStr} (${ev.priority})`, message, link)
      }

      missed++
    }
  }

  return NextResponse.json({ ok: true, sent, missed })
}
