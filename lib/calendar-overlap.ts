/**
 * Soft double-booking detection — warns, never blocks. Same lawyer/room booked
 * at overlapping times happens legitimately in practice (a lawyer delegates one
 * appointment, or genuinely intends to be at two things back-to-back), so this
 * surfaces a warning for a human to judge rather than rejecting the request.
 */
import { prisma } from '@/lib/prisma'
import { bangkokDateKey } from '@/lib/datetime-bangkok'

const DEFAULT_EVENT_DURATION_MS = 60 * 60 * 1000 // assumed 1h when endAt is missing

export type OverlapWarning = {
  id: string
  title: string
  startAt: string
  endAt: string | null
  reason: 'same_lawyer' | 'same_creator'
}

/** CalendarEvent (used by both /api/calendar-events and /api/court-calendar — same table). */
export async function findCalendarEventOverlaps(params: {
  startAt: Date
  endAt: Date | null
  assignedLawyerId?: string | null
  createdById: string
  excludeId?: string
}): Promise<OverlapWarning[]> {
  const effectiveEnd = params.endAt ?? new Date(params.startAt.getTime() + DEFAULT_EVENT_DURATION_MS)

  const candidates = await prisma.calendarEvent.findMany({
    where: {
      ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
      status: { notIn: ['CANCELLED', 'MISSED'] },
      OR: [
        ...(params.assignedLawyerId ? [{ assignedLawyerId: params.assignedLawyerId }] : []),
        { createdById: params.createdById },
      ],
      // prefilter to a window around the target time — the exact interval check happens below
      startAt: { gte: new Date(params.startAt.getTime() - 24 * 60 * 60 * 1000), lte: new Date(effectiveEnd.getTime() + 24 * 60 * 60 * 1000) },
    },
    select: { id: true, title: true, startAt: true, endAt: true, assignedLawyerId: true, createdById: true },
    take: 20,
  })

  return candidates
    .filter((ev) => {
      const evEnd = ev.endAt ?? new Date(ev.startAt.getTime() + DEFAULT_EVENT_DURATION_MS)
      return ev.startAt < effectiveEnd && evEnd > params.startAt // interval overlap
    })
    .map((ev) => ({
      id: ev.id,
      title: ev.title,
      startAt: ev.startAt.toISOString(),
      endAt: ev.endAt?.toISOString() ?? null,
      reason: params.assignedLawyerId && ev.assignedLawyerId === params.assignedLawyerId ? 'same_lawyer' : 'same_creator',
    }))
}

export type CourtOverlapWarning = {
  id: string
  courtName: string
  appointmentTime: string | null
  caseNumber: string | null
  reason: 'same_lawyer' | 'same_room'
}

/** CourtEvent has no endAt/duration — overlap here means "same calendar day" for the
 *  same lawyer or the same room, which is the most a human can meaningfully act on
 *  without real duration data. */
export async function findCourtEventOverlaps(params: {
  appointmentDate: Date
  courtName: string
  roomNumber?: string | null
  assignedLawyerId?: string | null
  excludeId?: string
}): Promise<CourtOverlapWarning[]> {
  // Bangkok calendar day for the target date — not UTC hours, which would silently
  // shift the boundary for the same reason fixed in items 1-3.
  const dayStart = new Date(`${bangkokDateKey(params.appointmentDate)}T00:00:00+07:00`)
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1)

  const orClauses: Record<string, unknown>[] = []
  if (params.assignedLawyerId) orClauses.push({ assignedLawyerId: params.assignedLawyerId })
  if (params.roomNumber) orClauses.push({ roomNumber: params.roomNumber, courtName: params.courtName })
  if (orClauses.length === 0) return []

  const candidates = await prisma.courtEvent.findMany({
    where: {
      ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
      status: { in: ['SCHEDULED', 'CONFIRMED'] },
      appointmentDate: { gte: dayStart, lte: dayEnd },
      OR: orClauses,
    },
    select: {
      id: true, courtName: true, appointmentTime: true, roomNumber: true, assignedLawyerId: true,
      case: { select: { caseNumber: true } },
    },
    take: 20,
  })

  return candidates.map((ev) => ({
    id: ev.id,
    courtName: ev.courtName,
    appointmentTime: ev.appointmentTime,
    caseNumber: ev.case.caseNumber,
    reason: params.assignedLawyerId && ev.assignedLawyerId === params.assignedLawyerId ? 'same_lawyer' : 'same_room',
  }))
}
