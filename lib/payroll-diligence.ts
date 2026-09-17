/**
 * เบี้ยขยัน (2026-09) — ตัดทั้งจำนวน (ไม่ pro-rate, ไม่มีเกณฑ์ขั้นต่ำ) ถ้าเดือน
 * นี้มี "ขาดงาน" หรือ "มาสาย" (นับตามนิยามเดียวกับ lateDeduction/absentDeduction
 * ที่ระบบใช้อยู่แล้ว — วันที่ตรงกับวันลาอนุมัติ/วันหยุดจะไม่ถูกนับเป็น "สาย" อยู่
 * แล้วโดย computeLateDeduction) หรือมีวันลาประเภทใดก็ตามที่ไม่ใช่ "ลาพักร้อน"
 * (VACATION) — ยืนยันจากผู้ใช้ 2026-09: ตัดทั้งหมดยกเว้นลาพักร้อนเท่านั้น
 */
export type DiligenceLeaveRow = { type: string }

export function computeDiligenceAllowance(
  defaultAmount: number | null | undefined,
  params: {
    lateDays: number
    absentDays: number
    /** ใบลาที่อนุมัติแล้วซึ่งช่วงวันทับกับเดือนนี้ (ทุกประเภท, ทุกสถานะที่ approved) */
    approvedLeaves: DiligenceLeaveRow[]
  },
): { amount: number; cut: boolean; cutReason?: string } {
  const base = defaultAmount ?? 0
  if (base <= 0) return { amount: 0, cut: false }

  if (params.lateDays > 0) return { amount: 0, cut: true, cutReason: 'late' }
  if (params.absentDays > 0) return { amount: 0, cut: true, cutReason: 'absent' }

  const nonVacationLeave = params.approvedLeaves.find((l) => l.type !== 'VACATION')
  if (nonVacationLeave) return { amount: 0, cut: true, cutReason: `leave:${nonVacationLeave.type}` }

  return { amount: base, cut: false }
}
