/**
 * ช่วงคำนวณเงินเดือนจริง (นโยบายบริษัท, ยืนยัน 2026-09) — นับมาสาย/ขาด/ลา/
 * วันทำงาน ตั้งแต่วันที่ 21 ของเดือนก่อนหน้า ถึงวันที่ 20 ของเดือนนี้ (ข้าม
 * เดือนปฏิทิน) การจ่ายเงินยังคงเป็นตอนสิ้นเดือนตามปกติ — พารามิเตอร์ `month`/
 * `year` ในระบบยังหมายถึง "เดือนที่ปิดยอด/จ่ายเงิน" เหมือนเดิมทุกที่ แค่ตัว
 * ช่วงวันที่ใช้นับเปลี่ยนไป
 *
 * แยกจาก monthDateRange() ใน lib/utils.ts โดยตั้งใจ — จุดที่ไม่เกี่ยวกับ
 * เงินเดือน (ปฏิทิน UI, ประกาศ, ใบเตือนวินัย, สรุปการเงินคดี ฯลฯ) ยังต้องใช้
 * เดือนปฏิทินเต็ม (1-30/31) ตามเดิม ไม่ใช่ช่วงนี้
 */
export function payrollPeriodRange(month: number, year: number) {
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year

  const start = new Date(prevYear, prevMonth - 1, 21)
  start.setHours(0, 0, 0, 0)
  const end = new Date(year, month - 1, 20)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}
