/** ลำดับปุ่มเดียว: เช็คอิน → (พักกลางวัน ←ไม่บังคับ→) → เช็คเอาท์ */
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
  /** true = อยู่ใน working state และสามารถเช็คเอาท์ได้โดยไม่ต้องพักกลางวัน */
  canCheckoutNow: boolean
}

export function getAttendanceProgress(record: AttendanceProgressInput): AttendanceProgress {
  if (!record?.checkIn) {
    return { nextAction: 'checkin', dayComplete: false, hasCheckInToday: false, canCheckoutNow: false }
  }
  if (record.checkOut) {
    return { nextAction: null, dayComplete: true, hasCheckInToday: true, canCheckoutNow: false }
  }
  // กำลังพักกลางวัน (ออกพักแล้วแต่ยังไม่กลับ) → ต้องกลับจากพักก่อน
  if (record.lunchOut && !record.lunchIn) {
    return { nextAction: 'lunch-in', dayComplete: false, hasCheckInToday: true, canCheckoutNow: false }
  }
  // Working state: เข้างานแล้ว + (ยังไม่พัก หรือ พักครบแล้ว)
  // → แสดงพักกลางวันเป็น nextAction แต่ canCheckoutNow = true (สามารถเช็คเอาท์ได้เลย)
  if (!record.lunchOut) {
    return { nextAction: 'lunch-out', dayComplete: false, hasCheckInToday: true, canCheckoutNow: true }
  }
  // พักครบแล้ว → เช็คเอาท์เลย
  return { nextAction: 'checkout', dayComplete: false, hasCheckInToday: true, canCheckoutNow: false }
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
