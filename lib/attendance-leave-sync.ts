import type { LeaveType } from '@prisma/client'
import { prisma } from '@/lib/prisma'

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
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(23, 59, 59, 999)

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
