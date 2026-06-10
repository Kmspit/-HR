import { prisma } from '@/lib/prisma'
import { bangkokDateKey } from '@/lib/datetime-bangkok'

export const WEEKLY_PLAN_LOCATION_TOLERANCE_METERS = 500

export type ApprovedPlanDay = {
  id: string
  planId: string
  place: string | null
  lat: number | null
  lng: number | null
  startTime: string | null
  endTime: string | null
  client: string | null
  purpose: string | null
}

/**
 * Find the approved weekly plan day entry for a given user and date (Bangkok time).
 * Returns null if no approved plan covers today.
 */
export async function findApprovedWeeklyPlanDayForDate(
  userId: string,
  date: Date,
): Promise<ApprovedPlanDay | null> {
  const dateKey = bangkokDateKey(date)
  const dayStart = new Date(`${dateKey}T00:00:00+07:00`)
  const dayEnd   = new Date(`${dateKey}T23:59:59+07:00`)

  const planDay = await prisma.weeklyPlanDay.findFirst({
    where: {
      date: { gte: dayStart, lte: dayEnd },
      plan: {
        lawyerId: userId,
        status: 'APPROVED',
      },
    },
    select: {
      id: true,
      planId: true,
      place: true,
      lat: true,
      lng: true,
      startTime: true,
      endTime: true,
      client: true,
      purpose: true,
    },
    orderBy: { date: 'desc' },
  })

  return planDay as ApprovedPlanDay | null
}
