import type { Attendance } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/** รอบงานที่ยังไม่เช็คเอาท์ (checkIn แล้ว แต่ checkOut ยังไม่มี) */
export async function findActiveAttendanceSession(
  userId: string,
  date: Date,
): Promise<Attendance | null> {
  return prisma.attendance.findFirst({
    where: {
      userId,
      date,
      checkIn: { not: null },
      checkOut: null,
    },
    orderBy: { sessionIndex: 'desc' },
  })
}

export async function findTodayAttendanceSessions(
  userId: string,
  date: Date,
): Promise<Attendance[]> {
  return prisma.attendance.findMany({
    where: { userId, date },
    orderBy: { sessionIndex: 'asc' },
  })
}

export async function getNextSessionIndex(userId: string, date: Date): Promise<number> {
  const agg = await prisma.attendance.aggregate({
    where: { userId, date },
    _max: { sessionIndex: true },
  })
  return (agg._max.sessionIndex ?? 0) + 1
}

/** เลือกแถวที่แสดงในรายการทีม — รอบที่กำลังทำงาน หรือรอบล่าสุดของวัน */
export function pickDisplaySessionForDay(sessions: Attendance[]): Attendance | null {
  if (!sessions.length) return null
  const active = sessions.find((s) => s.checkIn && !s.checkOut)
  if (active) return active
  return sessions.reduce((a, b) => (a.sessionIndex >= b.sessionIndex ? a : b))
}

/** แถวที่ใช้แสดง UI วันนี้ — รอบที่ยังไม่จบ หรือรอบล่าสุดที่เช็คเอาท์แล้ว (จำสถานะหลัง refresh) */
export async function findTodayAttendanceForDisplay(
  userId: string,
  date: Date,
): Promise<Attendance | null> {
  const active = await findActiveAttendanceSession(userId, date)
  if (active) return active
  return prisma.attendance.findFirst({
    where: { userId, date, checkIn: { not: null } },
    orderBy: { sessionIndex: 'desc' },
  })
}

export async function hasCheckInToday(userId: string, date: Date): Promise<boolean> {
  const row = await prisma.attendance.findFirst({
    where: { userId, date, checkIn: { not: null } },
    select: { id: true },
  })
  return !!row
}

export function sumDayWorkMinutes(sessions: Pick<Attendance, 'workMinutes' | 'checkIn' | 'checkOut' | 'lunchOut' | 'lunchIn'>[]): number {
  return sessions.reduce((sum, s) => {
    if (s.workMinutes > 0) return sum + s.workMinutes
    if (!s.checkIn || !s.checkOut) return sum
    let total = s.checkOut.getTime() - s.checkIn.getTime()
    if (s.lunchOut && s.lunchIn && s.lunchIn > s.lunchOut) {
      total -= s.lunchIn.getTime() - s.lunchOut.getTime()
    }
    return sum + Math.max(0, Math.floor(total / 60000))
  }, 0)
}
