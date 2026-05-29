import type { Attendance } from '@prisma/client'

export type AttendanceFlowAction = 'checkin' | 'checkout' | 'lunch-out' | 'lunch-in'

/** บันทึกทันทีหลังสแกนใบหน้าสำเร็จ — ไม่ต้องรอ HR อนุมัติ */
export const ATTENDANCE_COMPLETED_PATCH = {
  approved: true,
  attendanceStatus: 'completed' as const,
}

/** หน้าต่างกันสแกนซ้ำเร็ว ๆ (double-tap) */
export const DUPLICATE_ACTION_MS = 90_000

const FLOW_ERROR: Record<string, string> = {
  NO_CHECKIN: 'ต้องเช็คอินก่อน',
  ALREADY_CHECKIN: 'เช็คอินแล้ววันนี้',
  DUPLICATE_CHECKIN: 'เพิ่งเช็คอินไปแล้ว — กรุณารอสักครู่',
  ALREADY_CHECKOUT: 'เช็คเอาท์แล้ววันนี้',
  DUPLICATE_CHECKOUT: 'เพิ่งเช็คเอาท์ไปแล้ว — กรุณารอสักครู่',
  NEED_LUNCH_OUT: 'ต้องเริ่มพักกลางวันก่อน',
  ALREADY_LUNCH_OUT: 'บันทึกเริ่มพักกลางวันแล้ว',
  DUPLICATE_LUNCH_OUT: 'เพิ่งเริ่มพักไปแล้ว — กรุณารอสักครู่',
  NEED_LUNCH_IN: 'ต้องบันทึกกลับจากพักกลางวันก่อนเช็คเอาท์',
  ALREADY_LUNCH_IN: 'บันทึกกลับจากพักแล้ว',
  DUPLICATE_LUNCH_IN: 'เพิ่งบันทึกกลับจากพักไปแล้ว — กรุณารอสักครู่',
}

export function attendanceFlowErrorMessage(code: string): string {
  return FLOW_ERROR[code] ?? 'ไม่สามารถลงเวลาได้'
}

function isRecentDuplicate(timestamp: Date | null | undefined, now: Date): boolean {
  if (!timestamp) return false
  return now.getTime() - timestamp.getTime() < DUPLICATE_ACTION_MS
}

/**
 * ตรวจลำดับ: Check In → Lunch Start → Lunch End → Check Out
 * คืน error code หรือ null ถ้าผ่าน
 */
export function validateAttendanceFlow(
  att: Pick<
    Attendance,
    'checkIn' | 'checkOut' | 'lunchOut' | 'lunchIn'
  > | null,
  action: AttendanceFlowAction,
  now = new Date(),
): string | null {
  if (action === 'checkin') {
    if (att?.checkIn) {
      return isRecentDuplicate(att.checkIn, now) ? 'DUPLICATE_CHECKIN' : 'ALREADY_CHECKIN'
    }
    return null
  }

  if (!att?.checkIn) return 'NO_CHECKIN'

  if (action === 'lunch-out') {
    if (att.checkOut) return 'ALREADY_CHECKOUT'
    if (att.lunchOut) {
      return isRecentDuplicate(att.lunchOut, now) ? 'DUPLICATE_LUNCH_OUT' : 'ALREADY_LUNCH_OUT'
    }
    return null
  }

  if (action === 'lunch-in') {
    if (att.checkOut) return 'ALREADY_CHECKOUT'
    if (!att.lunchOut) return 'NEED_LUNCH_OUT'
    if (att.lunchIn) {
      return isRecentDuplicate(att.lunchIn, now) ? 'DUPLICATE_LUNCH_IN' : 'ALREADY_LUNCH_IN'
    }
    return null
  }

  if (action === 'checkout') {
    if (att.checkOut) {
      return isRecentDuplicate(att.checkOut, now) ? 'DUPLICATE_CHECKOUT' : 'ALREADY_CHECKOUT'
    }
    if (att.lunchOut && !att.lunchIn) return 'NEED_LUNCH_IN'
    return null
  }

  return null
}
