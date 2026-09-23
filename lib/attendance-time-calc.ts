import { bangkokDateKey } from '@/lib/datetime-bangkok'
import { OUTSIDE_WORK_LATE_TIME } from '@/lib/outside-work'
import type { AttendanceStatus } from '@prisma/client'

/**
 * Pure lateness/early-leave math, extracted (2026-09-23) from
 * app/api/attendance/checkin/route.ts and app/api/attendance/checkout/route.ts
 * so the upcoming Excel backdated-attendance import feature can call the
 * EXACT same formulas a real face-scan check-in/out uses, instead of
 * re-deriving them — two separate implementations of "what counts as late"
 * would drift apart over time as either one gets tweaked. The real routes
 * now call these functions too; behavior is unchanged, only relocated.
 */

export type CheckInSettings = {
  workStartTime: string | null
  lateGraceMin: number | null
}

export type CheckInLatenessResult = {
  lateMinutes: number
  status: 'NORMAL' | 'LATE'
}

export function computeCheckInLateness(params: {
  now: Date
  forceOutside: boolean
  hasOutsideWorkApproval: boolean
  settings: CheckInSettings | null
}): CheckInLatenessResult {
  const { now, forceOutside, hasOutsideWorkApproval, settings } = params
  const dateKey = bangkokDateKey(now)
  let lateMinutes = 0
  let status: 'NORMAL' | 'LATE' = 'NORMAL'

  if (forceOutside && hasOutsideWorkApproval) {
    // งานนอกสถานที่: สายหลัง 09:00
    const outsideDeadline = new Date(`${dateKey}T${OUTSIDE_WORK_LATE_TIME}:00+07:00`)
    if (now > outsideDeadline) {
      lateMinutes = Math.floor((now.getTime() - outsideDeadline.getTime()) / 60000)
      status = 'LATE'
    }
  } else if (!forceOutside && settings?.workStartTime) {
    // เช็คอินในบริษัท: สายหลัง workStartTime + grace period (เช่น 08:30 + 5 น. = 08:35)
    const graceMin = settings.lateGraceMin ?? 5
    const baseDeadline = new Date(`${dateKey}T${settings.workStartTime}:00+07:00`)
    const effectiveDeadline = new Date(baseDeadline.getTime() + graceMin * 60_000)
    if (now > effectiveDeadline) {
      lateMinutes = Math.floor((now.getTime() - effectiveDeadline.getTime()) / 60000)
      status = 'LATE'
    }
  }

  return { lateMinutes, status }
}

export type CheckOutSettings = {
  workEndTime: string | null
}

export type CheckOutEarlyLeaveResult = {
  earlyLeaveMinutes: number
  status: AttendanceStatus
}

export function computeCheckOutEarlyLeave(params: {
  now: Date
  currentStatus: AttendanceStatus
  settings: CheckOutSettings | null
}): CheckOutEarlyLeaveResult {
  const { now, currentStatus, settings } = params
  let earlyLeaveMinutes = 0
  let status = currentStatus

  if (settings?.workEndTime) {
    // สร้าง workEnd ในเวลาไทย (Asia/Bangkok, UTC+7) — ป้องกัน server timezone ผิด
    const dateKey = bangkokDateKey(now)
    const workEnd = new Date(`${dateKey}T${settings.workEndTime}:00+07:00`)
    if (now < workEnd) {
      earlyLeaveMinutes = Math.floor((workEnd.getTime() - now.getTime()) / 60000)
      status = 'EARLY_LEAVE'
    }
  }

  return { earlyLeaveMinutes, status }
}
