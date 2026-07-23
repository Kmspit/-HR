import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'
import { rejectUnauthorizedCron } from '@/lib/cron-secret'
import { apiError } from '@/lib/api-handler'
import { bangkokDayRange } from '@/lib/datetime-bangkok'

export async function GET(req: NextRequest) {
 try {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  // Find events whose startAt falls exactly 7, 3, 1 days from now, or today
  const checkOffsets = [0, 1, 3, 7]
  let sent = 0

  for (const daysAhead of checkOffsets) {
    const { start: dayStart, end: dayEnd } = bangkokDayRange(daysAhead)

    const events = await prisma.calendarEvent.findMany({
      where: {
        startAt: { gte: dayStart, lte: dayEnd },
        status: 'SCHEDULED',
      },
      include: { createdBy: { select: { id: true, name: true } } },
    })

    for (const ev of events) {
      const label = daysAhead === 0 ? 'วันนี้'
        : daysAhead === 1 ? 'พรุ่งนี้'
        : `อีก ${daysAhead} วัน`

      const typeLabel: Record<string, string> = {
        COURT: 'นัดศาล', CLIENT: 'นัดลูกค้า', DEBTOR: 'นัดลูกหนี้', INTERNAL: 'นัดภายใน',
      }

      void createNotification({
        userId: ev.createdById,
        type:   'CALENDAR_REMINDER',
        title:  `แจ้งเตือน: ${typeLabel[ev.eventType] ?? 'นัดหมาย'} ${label}`,
        message: `${ev.title}${ev.location ? ` — ${ev.location}` : ''}`,
        link:   '/appointments',
      })
      sent++
    }
  }

  // Also check court dates from TaskAssignment
  for (const daysAhead of checkOffsets) {
    const { start: dayStart, end: dayEnd } = bangkokDayRange(daysAhead)

    const tasks = await prisma.taskAssignment.findMany({
      where: { courtDate: { gte: dayStart, lte: dayEnd }, status: { notIn: ['COMPLETED'] } },
      select: { id: true, title: true, caseNumber: true, courtDate: true, assigneeId: true },
    })

    for (const t of tasks) {
      const label = daysAhead === 0 ? 'วันนี้' : daysAhead === 1 ? 'พรุ่งนี้' : `อีก ${daysAhead} วัน`
      void createNotification({
        userId: t.assigneeId,
        type:   'TASK_COURT_REMINDER',
        title:  `นัดศาล ${label}`,
        message: `${t.title}${t.caseNumber ? ` [${t.caseNumber}]` : ''}`,
        link:   '/court-calendar',
      })
      sent++
    }
  }

  return NextResponse.json({ ok: true, sent })
} catch (err) {
  return apiError(err)
 }
}
