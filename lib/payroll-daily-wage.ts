/** Attendance statuses that count as a full day's attendance for a DAILY/
 *  INTERN employee — they showed up and worked (whether on time, late, or
 *  left early), so they earn the full dailyRate for that day. Unlike a
 *  MONTHLY employee, a daily-wage employee is never separately docked for
 *  being late — the "if you don't come, you don't get paid" logic already
 *  covers it; stacking a per-minute late deduction on top would double-
 *  penalize the same day. */
export const DAILY_FULL_DAY_STATUSES = new Set(['NORMAL', 'LATE', 'EARLY_LEAVE', 'OT'])

/**
 * จำนวนวันที่นับเป็น "มาทำงานจริง" สำหรับพนักงานรายวัน/ฝึกงาน (payType=DAILY)
 *
 * นับเฉพาะแถว Attendance ที่มี checkIn จริง (มีการเช็คอินเกิดขึ้นจริง — ไม่ใช่
 * แถวที่แค่ syncApprovedLeaveAttendance() สร้าง/แก้ไว้จากใบลาโดยไม่มีการมา
 * ทำงานจริง) แล้วให้น้ำหนักตาม status:
 *   - NORMAL / LATE / EARLY_LEAVE / OT → 1 วันเต็ม (มาแล้ว ได้ค่าจ้างเต็มวัน)
 *   - HALF_DAY → 0.5 วัน
 *   - อื่นๆ (LEAVE, ABSENT ฯลฯ) → 0 วัน — ไม่มาไม่ได้เงิน แม้เป็นวันลาที่ได้รับ
 *     อนุมัติ หรือวันหยุดบริษัท/นักขัตฤกษ์ที่ไม่ได้มา (ยืนยันเป็นนโยบายบริษัท
 *     สำหรับพนักงานกลุ่มนี้แล้ว — รับทราบว่าต่างจาก พ.ร.บ.คุ้มครองแรงงาน
 *     ม.29 ที่กำหนดวันหยุดประเพณีอย่างน้อย 13 วัน/ปี)
 */
export function computeDaysWorked(
  attendances: { checkIn: Date | null; status: string }[],
): number {
  let days = 0
  for (const a of attendances) {
    if (!a.checkIn) continue
    if (a.status === 'HALF_DAY') days += 0.5
    else if (DAILY_FULL_DAY_STATUSES.has(a.status)) days += 1
  }
  return days
}
