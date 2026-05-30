import type { Attendance, AttendanceStatus, LeaveType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { LEAVE_TYPE_LABELS } from '@/lib/leave-types'
import { toDateKey } from '@/lib/company-holidays'
import { findApprovedLeaveOnDate } from '@/lib/attendance-leave-sync'
import { ATTENDANCE_COMPLETED_PATCH } from '@/lib/attendance-flow'
import {
  formatDateBangkok,
  formatDateDdMmYyyyBangkok,
  formatTimeBangkok,
} from '@/lib/datetime-bangkok'

/** 0 = อาทิตย์ … 6 = เสาร์ (ตรงกับ Date.getDay()) */
export const THAI_WEEKDAY_LABELS = [
  'อาทิตย์',
  'จันทร์',
  'อังคาร',
  'พุธ',
  'พฤหัสบดี',
  'ศุกร์',
  'เสาร์',
] as const

/** สถานะสำหรับแสดงผล (Attendance Work Form) */
export const ATTENDANCE_STATUS_DISPLAY: Record<AttendanceStatus, string> = {
  NORMAL: 'Present',
  LATE: 'Late',
  LEAVE: 'Leave',
  ABSENT: 'Absent',
  HALF_DAY: 'Half Day',
  EARLY_LEAVE: 'Early Leave',
  OT: 'OT',
}

const APPROVED_LEAVE_STATUSES = ['APPROVED', 'ADMIN_APPROVED'] as const

export function getDayOfWeekIndex(date: Date): number {
  return date.getDay()
}

export function getThaiWeekdayLabel(date: Date): string {
  return THAI_WEEKDAY_LABELS[getDayOfWeekIndex(date)] ?? ''
}

/** ชั่วโมงทำงาน (นาที) — หักพักกลางวันเมื่อมี lunchOut + lunchIn */
export function computeWorkMinutes(att: {
  checkIn: Date | null
  checkOut: Date | null
  lunchOut: Date | null
  lunchIn: Date | null
}): number {
  if (!att.checkIn || !att.checkOut) return 0
  let total = att.checkOut.getTime() - att.checkIn.getTime()
  if (att.lunchOut && att.lunchIn && att.lunchIn > att.lunchOut) {
    total -= att.lunchIn.getTime() - att.lunchOut.getTime()
  }
  return Math.max(0, Math.floor(total / 60000))
}

export function formatWorkHours(minutes: number): string {
  if (minutes <= 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h} ชม. ${m} น.` : `${h} ชม.`
}

export function formatTimeTh(iso: string | Date | null | undefined): string {
  return formatTimeBangkok(iso)
}

export function formatDateTh(iso: string | Date | null | undefined): string {
  return formatDateBangkok(iso)
}

export type WorkLogSummary = {
  present: number
  late: number
  leave: number
  absent: number
  halfDay: number
  earlyLeave: number
  totalWorkMinutes: number
  totalLateMinutes: number
  totalEarlyMinutes: number
}

export type AttendanceWorkLogRow = {
  id: string
  date: string
  dateLabel: string
  dayOfWeek: number
  dayLabel: string
  checkIn: string | null
  checkInTime: string
  checkInPlace: string | null
  checkInLat: number | null
  checkInLng: number | null
  lunchOut: string | null
  lunchOutTime: string
  lunchIn: string | null
  lunchInTime: string
  checkOut: string | null
  checkOutTime: string
  checkOutPlace: string | null
  checkOutLat: number | null
  checkOutLng: number | null
  lateMinutes: number
  earlyLeaveMinutes: number
  workMinutes: number
  workHoursLabel: string
  status: AttendanceStatus
  statusDisplay: string
  leaveType: LeaveType | null
  leaveTypeLabel: string | null
  note: string | null
  isOutside: boolean
}

/** แถวรายงานเมื่อดูหลายพนักงาน */
export type AttendanceWorkLogRowWithEmployee = AttendanceWorkLogRow & {
  employeeUserId: string
  employeeName: string
  employeeCode: string | null
  userStatus?: string
}

export function attendanceToWorkLogRow(a: Attendance): AttendanceWorkLogRow {
  const date = a.date
  const checkInPlace =
    a.checkInWorkPlaceName ?? a.workPlaceName ?? a.checkInAddress ?? a.address ?? null
  const checkOutPlace =
    a.checkOutWorkPlaceName ?? a.checkOutAddress ?? null

  const workMinutes = a.workMinutes > 0
    ? a.workMinutes
    : computeWorkMinutes(a)

  return {
    id: a.id,
    date: date.toISOString(),
    dateLabel: formatDateDdMmYyyyBangkok(date),
    dayOfWeek: a.dayOfWeek ?? getDayOfWeekIndex(date),
    dayLabel: THAI_WEEKDAY_LABELS[a.dayOfWeek ?? getDayOfWeekIndex(date)] ?? '',
    checkIn: a.checkIn?.toISOString() ?? null,
    checkInTime: formatTimeTh(a.checkIn),
    checkInPlace,
    checkInLat: a.checkInLat ?? a.lat ?? null,
    checkInLng: a.checkInLng ?? a.lng ?? null,
    lunchOut: a.lunchOut?.toISOString() ?? null,
    lunchOutTime: formatTimeTh(a.lunchOut),
    lunchIn: a.lunchIn?.toISOString() ?? null,
    lunchInTime: formatTimeTh(a.lunchIn),
    checkOut: a.checkOut?.toISOString() ?? null,
    checkOutTime: formatTimeTh(a.checkOut),
    checkOutPlace,
    checkOutLat: a.checkOutLat ?? null,
    checkOutLng: a.checkOutLng ?? null,
    lateMinutes: a.lateMinutes ?? 0,
    earlyLeaveMinutes: a.earlyLeaveMinutes ?? 0,
    workMinutes,
    workHoursLabel: formatWorkHours(workMinutes),
    status: a.status,
    statusDisplay: ATTENDANCE_STATUS_DISPLAY[a.status] ?? a.status,
    leaveType: a.leaveType ?? null,
    leaveTypeLabel: a.leaveType ? (LEAVE_TYPE_LABELS[a.leaveType] ?? a.leaveType) : null,
    note: a.note ?? null,
    isOutside: a.isOutside ?? false,
  }
}

/** คำนวณและบันทึกฟิลด์ work log — ไม่ทับ check-in/out ที่มีอยู่ */
export async function finalizeAttendanceRecord(attendanceId: string): Promise<Attendance> {
  const att = await prisma.attendance.findUnique({ where: { id: attendanceId } })
  if (!att) throw new Error('Attendance not found')

  const dayOfWeek = getDayOfWeekIndex(att.date)
  const workMinutes = computeWorkMinutes(att)
  const approvedLeave = await findApprovedLeaveOnDate(att.userId, att.date)

  let leaveType = att.leaveType
  let status = att.status

  if (approvedLeave) {
    leaveType = approvedLeave.type
    if (!att.checkIn) {
      status = 'LEAVE'
    } else if (approvedLeave.days < 1 && att.checkIn && !att.checkOut) {
      status = status === 'NORMAL' ? 'HALF_DAY' : status
    }
  }

  return prisma.attendance.update({
    where: { id: attendanceId },
    data: {
      ...ATTENDANCE_COMPLETED_PATCH,
      dayOfWeek,
      workMinutes,
      leaveType: leaveType ?? null,
      status,
      ...(att.checkInLat == null && att.lat != null
        ? {
            checkInLat: att.lat,
            checkInLng: att.lng,
            checkInAddress: att.address,
            checkInWorkPlaceName: att.workPlaceName,
          }
        : {}),
    },
  })
}

/** สร้าง/อัปเดตแถวลาอนุมัติในช่วงเดือน (ไม่ลบแถวที่มีเช็คอินแล้ว) */
export async function syncApprovedLeaveAttendance(
  userId: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<void> {
  const leaves = await prisma.leaveRequest.findMany({
    where: {
      userId,
      status: { in: [...APPROVED_LEAVE_STATUSES] },
      startDate: { lte: rangeEnd },
      endDate: { gte: rangeStart },
    },
  })

  for (const leave of leaves) {
    const start = new Date(Math.max(leave.startDate.getTime(), rangeStart.getTime()))
    const end = new Date(Math.min(leave.endDate.getTime(), rangeEnd.getTime()))
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const day = new Date(d)
      day.setHours(0, 0, 0, 0)
      const existing = await prisma.attendance.findUnique({
        where: { userId_date: { userId, date: day } },
      })
      if (existing?.checkIn) {
        if (!existing.leaveType) {
          await prisma.attendance.update({
            where: { id: existing.id },
            data: { leaveType: leave.type },
          })
        }
        continue
      }
      await prisma.attendance.upsert({
        where: { userId_date: { userId, date: day } },
        create: {
          userId,
          date: day,
          status: 'LEAVE',
          leaveType: leave.type,
          dayOfWeek: getDayOfWeekIndex(day),
          workMinutes: 0,
        },
        update: {
          status: 'LEAVE',
          leaveType: leave.type,
          dayOfWeek: getDayOfWeekIndex(day),
        },
      })
    }
  }
}

export async function buildMonthlyWorkLog(
  userId: string,
  month: number,
  year: number,
): Promise<{
  month: number
  year: number
  userId: string
  rows: AttendanceWorkLogRow[]
  summary: {
    present: number
    late: number
    leave: number
    absent: number
    halfDay: number
    earlyLeave: number
    totalWorkMinutes: number
    totalLateMinutes: number
    totalEarlyMinutes: number
  }
}> {
  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0, 23, 59, 59)

  await syncApprovedLeaveAttendance(userId, startDate, endDate)

  const records = await prisma.attendance.findMany({
    where: { userId, date: { gte: startDate, lte: endDate } },
    orderBy: { date: 'asc' },
  })

  for (const r of records) {
    await finalizeAttendanceRecord(r.id).catch(() => {})
  }

  const refreshed = await prisma.attendance.findMany({
    where: { userId, date: { gte: startDate, lte: endDate } },
    orderBy: { date: 'asc' },
  })

  const rows = refreshed.map(attendanceToWorkLogRow)
  const summary = summarizeWorkLogRows(rows)

  return { month, year, userId, rows, summary }
}

function summarizeWorkLogRows(rows: AttendanceWorkLogRow[]): WorkLogSummary {
  return {
    present: rows.filter((r) => r.status === 'NORMAL' || r.status === 'OT').length,
    late: rows.filter((r) => r.status === 'LATE').length,
    leave: rows.filter((r) => r.status === 'LEAVE').length,
    absent: rows.filter((r) => r.status === 'ABSENT').length,
    halfDay: rows.filter((r) => r.status === 'HALF_DAY').length,
    earlyLeave: rows.filter((r) => r.status === 'EARLY_LEAVE').length,
    totalWorkMinutes: rows.reduce((s, r) => s + r.workMinutes, 0),
    totalLateMinutes: rows.reduce((s, r) => s + r.lateMinutes, 0),
    totalEarlyMinutes: rows.reduce((s, r) => s + r.earlyLeaveMinutes, 0),
  }
}

/** รายงานรวมทุกคนในทีม (ตามรายชื่อที่ส่งมา) */
export async function buildMonthlyWorkLogForTeam(
  users: { id: string; name: string; employeeId: string | null; status?: string }[],
  month: number,
  year: number,
): Promise<{
  month: number
  year: number
  userId: string
  rows: AttendanceWorkLogRowWithEmployee[]
  summary: WorkLogSummary
  employeeCount: number
}> {
  const combined: AttendanceWorkLogRowWithEmployee[] = []

  for (const u of users) {
    const report = await buildMonthlyWorkLog(u.id, month, year)
    for (const row of report.rows) {
      combined.push({
        ...row,
        id: `${u.id}-${row.id}`,
        employeeUserId: u.id,
        employeeName: u.name,
        employeeCode: u.employeeId,
        userStatus: u.status,
      })
    }
  }

  combined.sort((a, b) => {
    const da = a.date.localeCompare(b.date)
    if (da !== 0) return da
    return a.employeeName.localeCompare(b.employeeName, 'th')
  })

  return {
    month,
    year,
    userId: 'all',
    rows: combined,
    summary: summarizeWorkLogRows(combined),
    employeeCount: users.length,
  }
}

/** สำหรับ payroll — นาทีทำงานรวมในเดือน */
export function sumWorkMinutesForPayroll(
  attendances: { workMinutes: number; status: string; checkIn: Date | null }[],
): number {
  return attendances.reduce((s, a) => {
    if (a.status === 'LEAVE' || a.status === 'ABSENT') return s
    if (!a.checkIn) return s
    return s + (a.workMinutes ?? 0)
  }, 0)
}

export function dateKeyInLeaveSet(date: Date, leaveDateKeys: Set<string>): boolean {
  return leaveDateKeys.has(toDateKey(date))
}
