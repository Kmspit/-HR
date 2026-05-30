import type { Attendance } from '@prisma/client'

export type AttendanceFlowAction = 'checkin' | 'checkout' | 'lunch-out' | 'lunch-in'

/** บันทึกทันทีหลังสแกนใบหน้าสำเร็จ — ไม่ต้องรอ HR อนุมัติ */
export const ATTENDANCE_COMPLETED_PATCH = {
  approved: true,
  attendanceStatus: 'completed' as const,
}

const FLOW_ERROR: Record<string, string> = {
  NO_CHECKIN:      'ต้องเช็คอินก่อน',
  ALREADY_CHECKIN: 'เช็คอินแล้ววันนี้',
  ALREADY_CHECKOUT: 'เช็คเอาท์แล้ววันนี้',
  NEED_LUNCH_OUT:  'ต้องเริ่มพักกลางวันก่อน',
  ALREADY_LUNCH_OUT: 'บันทึกเริ่มพักกลางวันแล้ว',
  NEED_LUNCH_IN:   'ต้องบันทึกกลับจากพักกลางวันก่อนเช็คเอาท์',
  ALREADY_LUNCH_IN: 'บันทึกกลับจากพักแล้ว',
}

export function attendanceFlowErrorMessage(code: string): string {
  return FLOW_ERROR[code] ?? 'ไม่สามารถลงเวลาได้'
}

/**
 * ตรวจลำดับ: Check In → Lunch Start → Lunch End → Check Out
 * - ไม่มี scan cooldown (สแกนซ้ำได้ไม่จำกัดครั้งถ้าล้มเหลว)
 * - ป้องกัน duplicate ระดับวัน (ALREADY_*) เท่านั้น
 * คืน error code หรือ null ถ้าผ่าน
 */
export function validateAttendanceFlow(
  att: Pick<Attendance, 'checkIn' | 'checkOut' | 'lunchOut' | 'lunchIn'> | null,
  action: AttendanceFlowAction,
  _now = new Date(),
): string | null {
  if (action === 'checkin') {
    if (att?.checkIn) return 'ALREADY_CHECKIN'
    return null
  }

  if (!att?.checkIn) return 'NO_CHECKIN'

  if (action === 'lunch-out') {
    if (att.checkOut) return 'ALREADY_CHECKOUT'
    if (att.lunchOut) return 'ALREADY_LUNCH_OUT'
    return null
  }

  if (action === 'lunch-in') {
    if (att.checkOut) return 'ALREADY_CHECKOUT'
    if (!att.lunchOut) return 'NEED_LUNCH_OUT'
    if (att.lunchIn) return 'ALREADY_LUNCH_IN'
    return null
  }

  if (action === 'checkout') {
    if (att.checkOut) return 'ALREADY_CHECKOUT'
    if (att.lunchOut && !att.lunchIn) return 'NEED_LUNCH_IN'
    return null
  }

  return null
}
