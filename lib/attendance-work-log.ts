import type { Attendance, AttendanceStatus, LeaveType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { LEAVE_TYPE_LABELS } from '@/lib/leave-types'
import { toDateKey } from '@/lib/company-holidays'
import { findApprovedLeaveOnDate, type ApprovedLeaveOnDate } from '@/lib/attendance-leave-sync'
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

/** แสดงนาทีในรูปแบบ "X ชั่วโมง Y นาที" (รวม 0 ชั่วโมง) */
export function formatMinutesThai(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h} ชั่วโมง ${m} นาที`
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
  totalLunchOverMinutes: number
}

export type AttendanceWorkLogRow = {
  id: string
  date: string
  dateLabel: string
  sessionIndex: number
  sessionLabel: string
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
  lunchOverMinutes: number
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
    sessionIndex: a.sessionIndex ?? 1,
    sessionLabel: (a.sessionIndex ?? 1) > 1 ? `รอบ ${a.sessionIndex}` : 'รอบหลัก',
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
    lunchOverMinutes: a.lunchOverMinutes ?? 0,
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

/** ผลการคำนวณ field ที่ finalize (pure — ไม่แตะ DB) ใช้ร่วมกันทั้ง single-record
 * path (finalizeAttendanceRecord) และ batched path (fetchAndFinalizeAttendanceForUsers)
 * เพื่อไม่ให้ logic สองจุดนี้ drift ออกจากกัน */
type FinalizedAttendanceFields = {
  dayOfWeek: number
  workMinutes: number
  leaveType: LeaveType | null
  status: AttendanceStatus
  checkInLat?: number | null
  checkInLng?: number | null
  checkInAddress?: string | null
  checkInWorkPlaceName?: string | null
}

function computeFinalizedFields(
  att: Pick<Attendance, 'date' | 'checkIn' | 'checkOut' | 'lunchOut' | 'lunchIn' | 'leaveType' | 'status' | 'checkInLat' | 'lat' | 'lng' | 'address' | 'workPlaceName'>,
  approvedLeave: ApprovedLeaveOnDate | null,
): FinalizedAttendanceFields {
  const dayOfWeek = getDayOfWeekIndex(att.date)
  const workMinutes = computeWorkMinutes(att)

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

  return {
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
  }
}

/** true = ค่าที่คำนวณได้ต่างจากที่บันทึกไว้จริง (จึงต้อง write) — ใช้ข้าม write
 * ที่เป็น no-op เมื่อ finalize ซ้ำข้อมูลเดิม (เช่น เปิดหน้าเดิมซ้ำ) */
function finalizedFieldsDiffer(att: Attendance, f: FinalizedAttendanceFields): boolean {
  if (att.approved !== true) return true
  if (att.attendanceStatus !== 'completed') return true
  if (att.dayOfWeek !== f.dayOfWeek) return true
  if (att.workMinutes !== f.workMinutes) return true
  if ((att.leaveType ?? null) !== f.leaveType) return true
  if (att.status !== f.status) return true
  if ('checkInLat' in f) {
    if (att.checkInLat !== f.checkInLat) return true
    if (att.checkInLng !== f.checkInLng) return true
    if (att.checkInAddress !== f.checkInAddress) return true
    if (att.checkInWorkPlaceName !== f.checkInWorkPlaceName) return true
  }
  return false
}

/** คำนวณและบันทึกฟิลด์ work log — ไม่ทับ check-in/out ที่มีอยู่ */
export async function finalizeAttendanceRecord(attendanceId: string): Promise<Attendance> {
  const att = await prisma.attendance.findUnique({ where: { id: attendanceId } })
  if (!att) throw new Error('Attendance not found')

  const approvedLeave = await findApprovedLeaveOnDate(att.userId, att.date)
  const computed = computeFinalizedFields(att, approvedLeave)

  return prisma.attendance.update({
    where: { id: attendanceId },
    data: { ...ATTENDANCE_COMPLETED_PATCH, ...computed },
  })
}

/** เลือก approved leave ที่ครอบคลุมวันที่กำหนด จาก leave ที่ pre-fetch มาแล้ว —
 * เทียบเท่า findApprovedLeaveOnDate (orderBy startDate desc, take first) แต่ไม่ query DB */
function pickApprovedLeaveForDate(
  leaves: ApprovedLeaveOnDate[],
  date: Date,
): ApprovedLeaveOnDate | null {
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(23, 59, 59, 999)

  let best: ApprovedLeaveOnDate | null = null
  for (const l of leaves) {
    if (l.startDate <= dayEnd && l.endDate >= dayStart) {
      if (!best || l.startDate > best.startDate) best = l
    }
  }
  return best
}

/**
 * Defensive ceiling on concurrent Attendance writes fired from the batched
 * finalize path below. Turso's connection here is the stateless HTTP/Hrana
 * remote client (`libsql://...` via @prisma/adapter-libsql) — there is no
 * connection-pool setting to tune (Prisma's usual `connection_limit` applies
 * to TCP-pooled databases, not this driver-adapter mode), and no published
 * per-plan concurrent-request ceiling was available to check from this
 * project. Rather than assume an unbounded burst (worst case: a never-
 * before-viewed team/month, up to ~3,000 rows) is safe, cap it — batches of
 * 20 concurrent writes are still a massive improvement over the old fully
 * sequential per-record loop, just not "all at once."
 */
const ATTENDANCE_FINALIZE_WRITE_CONCURRENCY = 20

/** Runs `fn` over `items` with at most `limit` in flight at a time. */
async function mapWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit)
    const batchResults = await Promise.all(batch.map(fn))
    for (let j = 0; j < batchResults.length; j++) {
      results[i + j] = batchResults[j]
    }
  }
  return results
}

/**
 * Batched equivalent of calling finalizeAttendanceRecord() once per record:
 * one findMany for attendance + one findMany for leave requests (covering ALL
 * given users), finalized-field computation done in memory, and a write only
 * for rows whose computed value actually differs from what's stored — instead
 * of N sequential (findUnique + findFirst + update) round trips. Writes that
 * are actually needed go out in throttled batches (see
 * ATTENDANCE_FINALIZE_WRITE_CONCURRENCY), not all at once.
 */
async function fetchAndFinalizeAttendanceForUsers(
  userIds: string[],
  startDate: Date,
  endDate: Date,
): Promise<Attendance[]> {
  const [records, leaves] = await Promise.all([
    prisma.attendance.findMany({
      where: { userId: { in: userIds }, date: { gte: startDate, lte: endDate } },
      orderBy: [{ date: 'asc' }, { sessionIndex: 'asc' }],
    }),
    prisma.leaveRequest.findMany({
      where: {
        userId: { in: userIds },
        status: { in: [...APPROVED_LEAVE_STATUSES] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      select: { id: true, userId: true, type: true, days: true, startDate: true, endDate: true },
    }),
  ])

  const leavesByUser = new Map<string, ApprovedLeaveOnDate[]>()
  for (const l of leaves) {
    const list = leavesByUser.get(l.userId) ?? []
    list.push(l)
    leavesByUser.set(l.userId, list)
  }

  const finalRecords: Attendance[] = new Array(records.length)
  const pendingUpdates: { index: number; original: Attendance; data: FinalizedAttendanceFields }[] = []

  records.forEach((r, index) => {
    const approvedLeave = pickApprovedLeaveForDate(leavesByUser.get(r.userId) ?? [], r.date)
    const computed = computeFinalizedFields(r, approvedLeave)
    if (!finalizedFieldsDiffer(r, computed)) {
      finalRecords[index] = r
    } else {
      pendingUpdates.push({ index, original: r, data: computed })
    }
  })

  if (pendingUpdates.length > 0) {
    const updateResults = await mapWithConcurrencyLimit(
      pendingUpdates,
      ATTENDANCE_FINALIZE_WRITE_CONCURRENCY,
      async (u) => {
        try {
          return await prisma.attendance.update({
            where: { id: u.original.id },
            data: { ...ATTENDANCE_COMPLETED_PATCH, ...u.data },
          })
        } catch {
          return u.original
        }
      },
    )
    updateResults.forEach((updated, i) => {
      finalRecords[pendingUpdates[i].index] = updated
    })
  }

  return finalRecords
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
      const hasCheckIn = await prisma.attendance.findFirst({
        where: { userId, date: day, checkIn: { not: null } },
      })
      if (hasCheckIn) {
        if (!hasCheckIn.leaveType) {
          await prisma.attendance.update({
            where: { id: hasCheckIn.id },
            data: { leaveType: leave.type },
          })
        }
        continue
      }
      const leaveRow = await prisma.attendance.findFirst({
        where: { userId, date: day, sessionIndex: 1, checkIn: null },
      })
      if (leaveRow) {
        await prisma.attendance.update({
          where: { id: leaveRow.id },
          data: { status: 'LEAVE', leaveType: leave.type, dayOfWeek: getDayOfWeekIndex(day) },
        })
        continue
      }
      await prisma.attendance.create({
        data: {
          userId,
          date: day,
          sessionIndex: 1,
          status: 'LEAVE',
          leaveType: leave.type,
          dayOfWeek: getDayOfWeekIndex(day),
          workMinutes: 0,
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
  summary: WorkLogSummary
}> {
  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0, 23, 59, 59)

  await syncApprovedLeaveAttendance(userId, startDate, endDate)

  const records = await fetchAndFinalizeAttendanceForUsers([userId], startDate, endDate)

  const rows = records.map(attendanceToWorkLogRow)
  const summary = summarizeWorkLogRows(rows)

  return { month, year, userId, rows, summary }
}

function summarizeWorkLogRows(rows: AttendanceWorkLogRow[]): WorkLogSummary {
  const byDate = new Map<string, AttendanceWorkLogRow[]>()
  for (const r of rows) {
    const key = r.date.slice(0, 10)
    const list = byDate.get(key) ?? []
    list.push(r)
    byDate.set(key, list)
  }

  let present = 0
  let late = 0
  let leave = 0
  let absent = 0
  let halfDay = 0
  let earlyLeave = 0

  for (const dayRows of byDate.values()) {
    const hasLeaveOnly = dayRows.every((r) => r.status === 'LEAVE' && !r.checkIn)
    const worked = dayRows.some((r) => r.checkIn)
    if (hasLeaveOnly) {
      leave += 1
      continue
    }
    if (worked) {
      present += 1
      if (dayRows.some((r) => r.status === 'LATE')) late += 1
      if (dayRows.some((r) => r.status === 'HALF_DAY')) halfDay += 1
      if (dayRows.some((r) => r.status === 'EARLY_LEAVE')) earlyLeave += 1
    } else if (dayRows.some((r) => r.status === 'ABSENT')) {
      absent += 1
    }
  }

  return {
    present,
    late,
    leave,
    absent,
    halfDay,
    earlyLeave,
    totalWorkMinutes: rows.reduce((s, r) => s + r.workMinutes, 0),
    totalLateMinutes: rows.reduce((s, r) => s + (r.sessionIndex === 1 ? r.lateMinutes : 0), 0),
    totalEarlyMinutes: rows.reduce((s, r) => s + r.earlyLeaveMinutes, 0),
    totalLunchOverMinutes: rows.reduce((s, r) => s + r.lunchOverMinutes, 0),
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
  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0, 23, 59, 59)
  const userIds = users.map((u) => u.id)

  await Promise.all(userIds.map((id) => syncApprovedLeaveAttendance(id, startDate, endDate)))

  const records = await fetchAndFinalizeAttendanceForUsers(userIds, startDate, endDate)

  const byUser = new Map(users.map((u) => [u.id, u]))
  const combined: AttendanceWorkLogRowWithEmployee[] = records.map((r) => {
    const row = attendanceToWorkLogRow(r)
    const u = byUser.get(r.userId)
    return {
      ...row,
      id: `${r.userId}-${row.id}`,
      employeeUserId: r.userId,
      employeeName: u?.name ?? '',
      employeeCode: u?.employeeId ?? null,
      userStatus: u?.status,
    }
  })

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
