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
 *
 * Timezone (แก้ 2026-10, fix/payroll-formulas-round1): ขอบเขตรอบยึดเวลาไทย
 * (Asia/Bangkok, UTC+7) เสมอ ไม่ขึ้นกับ TZ ของ server — เดิมสร้างด้วย
 * `new Date(y, m, d)` + `setHours()` ซึ่งตีความตาม TZ ของ runtime: บน Vercel
 * (UTC, ไม่ได้ตั้ง env TZ) รอบเลื่อนไปเป็น 22–21 ตามวันไทย เพราะ
 * Attendance.date เก็บเป็นเที่ยงคืนไทย (17:00 UTC ของวันก่อนหน้า) ห้ามอ่าน
 * start/end ด้วย getDate()/getMonth() — ใช้ payrollPeriodKeys() แทน
 */

/** YYYY-MM-DD ของวันแรก/วันสุดท้ายในรอบ (ตามปฏิทินไทย, inclusive ทั้งคู่) */
export function payrollPeriodKeys(month: number, year: number): { startKey: string; endKey: string } {
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  return {
    startKey: `${prevYear}-${String(prevMonth).padStart(2, '0')}-21`,
    endKey: `${year}-${String(month).padStart(2, '0')}-20`,
  }
}

export function payrollPeriodRange(month: number, year: number) {
  const { startKey, endKey } = payrollPeriodKeys(month, year)
  const start = new Date(`${startKey}T00:00:00.000+07:00`)
  const end = new Date(`${endKey}T23:59:59.999+07:00`)
  return { start, end }
}

/** แยก YYYY-MM-DD เป็นตัวเลข (ไม่ผ่าน Date จึงไม่ขึ้นกับ TZ) — ใช้แสดงผลหัวรอบ */
export function dateKeyParts(key: string): { year: number; month: number; day: number } {
  const [y, m, d] = key.split('-').map(Number)
  return { year: y, month: m, day: d }
}

function keyToUtcMs(key: string): number {
  const { year, month, day } = dateKeyParts(key)
  return Date.UTC(year, month - 1, day)
}

/** จำนวนวันปฏิทินแบบนับรวมหัวท้าย ระหว่าง 2 date key (from > to → 0) */
export function daysBetweenKeysInclusive(fromKey: string, toKey: string): number {
  if (fromKey > toKey) return 0
  return Math.round((keyToUtcMs(toKey) - keyToUtcMs(fromKey)) / 86_400_000) + 1
}

/** เลื่อน date key ไป n วัน (n ติดลบได้) */
export function addDaysToKey(key: string, n: number): string {
  return new Date(keyToUtcMs(key) + n * 86_400_000).toISOString().slice(0, 10)
}
