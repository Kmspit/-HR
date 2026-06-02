/** ลำดับปุ่มเดียว: เช็คอิน → พักกลางวัน → เลิกพัก → เช็คเอาท์ */
export type AttendanceAction = 'checkin' | 'lunch-out' | 'lunch-in' | 'checkout'

export type AttendanceProgressInput = {
  checkIn: Date | string | null
  checkOut: Date | string | null
  lunchOut: Date | string | null
  lunchIn: Date | string | null
} | null

export type AttendanceProgress = {
  nextAction: AttendanceAction | null
  dayComplete: boolean
  hasCheckInToday: boolean
}

export function getAttendanceProgress(record: AttendanceProgressInput): AttendanceProgress {
  if (!record?.checkIn) {
    return { nextAction: 'checkin', dayComplete: false, hasCheckInToday: false }
  }
  if (record.checkOut) {
    return { nextAction: null, dayComplete: true, hasCheckInToday: true }
  }
  if (!record.lunchOut) {
    return { nextAction: 'lunch-out', dayComplete: false, hasCheckInToday: true }
  }
  if (!record.lunchIn) {
    return { nextAction: 'lunch-in', dayComplete: false, hasCheckInToday: true }
  }
  return { nextAction: 'checkout', dayComplete: false, hasCheckInToday: true }
}

export const ACTION_LABELS: Record<AttendanceAction, string> = {
  checkin: 'เช็คอิน',
  'lunch-out': 'พักกลางวัน',
  'lunch-in': 'เลิกพักกลางวัน',
  checkout: 'เช็คเอาท์',
}

/** ประเภทสำหรับ LINE / บันทึก */
export const ACTION_EVENT_TYPE: Record<AttendanceAction, string> = {
  checkin: 'checkin',
  'lunch-out': 'lunch_start',
  'lunch-in': 'lunch_end',
  checkout: 'checkout',
}
