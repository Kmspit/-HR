import type { Attendance } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * Explicit select (2026-09-23, part of the Attendance.importBatchId schema
 * change) — CONTRIBUTING.md requires every prisma.attendance query to name
 * its fields explicitly, since a bare/full-select query breaks the moment
 * schema.prisma declares a column the live DB doesn't have yet. This is the
 * union of every field any caller of findActiveAttendanceSession /
 * findTodayAttendanceForDisplay actually reads (audited call-by-call):
 * checkin/checkout/lunch/hr-override routes need only a handful of these,
 * but findTodayAttendanceForDisplay delegates straight through to
 * findActiveAttendanceSession and its own callers (the dashboards,
 * app/(dashboard)/attendance/page.tsx) need the rest — one shared select
 * satisfies both rather than risking two selects drifting out of sync.
 */
const ATTENDANCE_SESSION_SELECT = {
  id: true,
  sessionIndex: true,
  checkIn: true,
  checkOut: true,
  lunchOut: true,
  lunchIn: true,
  status: true,
  lateMinutes: true,
  earlyLeaveMinutes: true,
  isOutside: true,
  address: true,
  workPlaceName: true,
  photoUrl: true,
  checkOutPhotoUrl: true,
  lunchOutPhotoUrl: true,
  lunchInPhotoUrl: true,
  lat: true,
  lng: true,
  autoCheckout: true,
} as const

export type AttendanceSessionRow = Pick<Attendance, keyof typeof ATTENDANCE_SESSION_SELECT>

/** รอบงานที่ยังไม่เช็คเอาท์ (checkIn แล้ว แต่ checkOut ยังไม่มี) */
export async function findActiveAttendanceSession(
  userId: string,
  date: Date,
): Promise<AttendanceSessionRow | null> {
  return prisma.attendance.findFirst({
    where: {
      userId,
      date,
      checkIn: { not: null },
      checkOut: null,
    },
    orderBy: { sessionIndex: 'desc' },
    select: ATTENDANCE_SESSION_SELECT,
  })
}

/** ไม่มีผู้เรียกใช้จริงในระบบตอนนี้ (ตรวจสอบแล้ว 2026-09-23) — เก็บ select ให้
 *  ตรงกับ pickDisplaySessionForDay/sumDayWorkMinutes ด้านล่างไว้เผื่อถูกเอามาใช้
 *  ในอนาคต แทนที่จะปล่อยเป็น full-select ไว้เฉยๆ */
export async function findTodayAttendanceSessions(
  userId: string,
  date: Date,
): Promise<Pick<Attendance, 'id' | 'sessionIndex' | 'checkIn' | 'checkOut' | 'lunchOut' | 'lunchIn' | 'workMinutes' | 'status'>[]> {
  return prisma.attendance.findMany({
    where: { userId, date },
    orderBy: { sessionIndex: 'asc' },
    select: {
      id: true,
      sessionIndex: true,
      checkIn: true,
      checkOut: true,
      lunchOut: true,
      lunchIn: true,
      workMinutes: true,
      status: true,
    },
  })
}

export async function getNextSessionIndex(userId: string, date: Date): Promise<number> {
  const agg = await prisma.attendance.aggregate({
    where: { userId, date },
    _max: { sessionIndex: true },
  })
  return (agg._max.sessionIndex ?? 0) + 1
}

/** เลือกแถวที่แสดงในรายการทีม — รอบที่กำลังทำงาน หรือรอบล่าสุดของวัน.
 *  Generic (2026-09-23, กลุ่ม 2) — ผู้เรียกใช้จริงตอนนี้คือ
 *  app/(dashboard)/attendance/page.tsx ซึ่งเลือก select ของตัวเองตามที่ใช้จริง
 *  (userId/sessionIndex/checkIn/checkOut/status) ฟังก์ชันนี้เองใช้แค่
 *  sessionIndex/checkIn/checkOut ภายใน แต่ generic ไว้เพื่อคง field อื่นที่
 *  ผู้เรียกต้องใช้ต่อ (เช่น status) ไม่ให้หายไปตอน narrow select — ระวัง: ห้าม
 *  ใช้ `ReturnType<typeof pickDisplaySessionForDay>` แบบไม่ระบุ type argument
 *  (จะ resolve เป็นแค่ constraint 3 field ไม่ใช่ type จริงที่ caller ใช้) */
export function pickDisplaySessionForDay<T extends Pick<Attendance, 'sessionIndex' | 'checkIn' | 'checkOut'>>(sessions: T[]): T | null {
  if (!sessions.length) return null
  const active = sessions.find((s) => s.checkIn && !s.checkOut)
  if (active) return active
  return sessions.reduce((a, b) => (a.sessionIndex >= b.sessionIndex ? a : b))
}

/** แถวที่ใช้แสดง UI วันนี้ — รอบที่ยังไม่จบ หรือรอบล่าสุดที่เช็คเอาท์แล้ว (จำสถานะหลัง refresh) */
export async function findTodayAttendanceForDisplay(
  userId: string,
  date: Date,
): Promise<AttendanceSessionRow | null> {
  const active = await findActiveAttendanceSession(userId, date)
  if (active) return active
  return prisma.attendance.findFirst({
    where: { userId, date, checkIn: { not: null } },
    orderBy: { sessionIndex: 'desc' },
    select: ATTENDANCE_SESSION_SELECT,
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
