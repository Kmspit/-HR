import { prisma } from '@/lib/prisma'
import { bangkokDateKey } from '@/lib/datetime-bangkok'

/** 09:00 Bangkok = สายสำหรับงานนอกสถานที่ */
export const OUTSIDE_WORK_LATE_TIME = '09:00'

export type ApprovedOutsideWork = {
  id: string
  place: string
  startTime: string
  endTime: string
  date: Date
}

/**
 * หา OutsideWorkRequest ที่ APPROVED ตรงกับวันที่กำหนด (เวลาไทย)
 * ใช้ใน attendance checkin เพื่อ validate สิทธิ์เช็คอินนอกสำนักงาน
 */
export async function findApprovedOutsideWorkForDate(
  userId: string,
  date: Date,
): Promise<ApprovedOutsideWork | null> {
  const dateKey = bangkokDateKey(date) // 'YYYY-MM-DD' ตามปฏิทินไทย
  // form ส่ง new Date('YYYY-MM-DD') = UTC midnight
  // dayStart/dayEnd ครอบคลุม UTC midnight ของ dateKey
  const dayStart = new Date(`${dateKey}T00:00:00+07:00`) // Bangkok midnight → UTC-7h
  const dayEnd   = new Date(`${dateKey}T23:59:59+07:00`) // Bangkok end → UTC-7h+24h

  const req = await prisma.outsideWorkRequest.findFirst({
    where: {
      userId,
      status: 'APPROVED',
      date: { gte: dayStart, lte: dayEnd },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, place: true, startTime: true, endTime: true, date: true },
  })

  return req
}
