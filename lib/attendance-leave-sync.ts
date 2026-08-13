import type { LeaveType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { startOfDayBangkok } from '@/lib/datetime-bangkok'

const APPROVED = ['APPROVED', 'ADMIN_APPROVED'] as const

export type ApprovedLeaveOnDate = {
  id: string
  type: LeaveType
  days: number
  startDate: Date
  endDate: Date
}

/** ลาอนุมัติที่ครอบคลุมวันที่กำหนด (ใช้ auto-fill ประเภทการลา) */
export async function findApprovedLeaveOnDate(
  userId: string,
  date: Date,
): Promise<ApprovedLeaveOnDate | null> {
  const dayStart = startOfDayBangkok(date)
  const dayEnd = new Date(dayStart.getTime() + 86_400_000 - 1)

  const leave = await prisma.leaveRequest.findFirst({
    where: {
      userId,
      status: { in: [...APPROVED] },
      startDate: { lte: dayEnd },
      endDate: { gte: dayStart },
    },
    orderBy: { startDate: 'desc' },
    select: {
      id: true,
      type: true,
      days: true,
      startDate: true,
      endDate: true,
    },
  })

  return leave
}
