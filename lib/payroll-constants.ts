/**
 * Social Security Fund — employee contribution (5%, capped monthly).
 * Ceiling wage base raised 15,000 → 17,500 THB/month, effective 2026-01-01
 * through 2028-12-31 (confirmed), so the 5% cap rises 750 → 875 THB/month.
 * Single source of truth — both the payroll generate route and the employee
 * edit page's SS preview must read from here, not hardcode either number.
 */
export const SS_RATE = 0.05
export const SS_MAX = 875
/** ฐานค่าจ้างขั้นต่ำ/สูงสุดที่ใช้คิดเงินสมทบ (2026-10): ค่าจ้างต่ำกว่า 1,650 คิดที่
 *  1,650 (= 83 บาท), สูงกว่า 17,500 คิดที่ 17,500 (= 875 บาท) */
export const SS_MIN_WAGE = 1_650
export const SS_MAX_WAGE = 17_500

/**
 * เงินสมทบประกันสังคมส่วนลูกจ้างของเดือนนี้ — แหล่งเดียวทั้งระบบ (2026-10)
 * ฐาน = ค่าจ้างที่จ่ายจริง (หลัง prorate) บีบไว้ในช่วง 1,650–17,500 × 5%
 * ปัดเป็นบาทเต็มแบบ ≥ 0.50 ปัดขึ้น / < 0.50 ปัดทิ้ง ไม่มีค่าจ้างเลย (≤ 0) = 0
 * ตัวอย่าง: 12,345 → 617 · 800 → 83 · 8,750 → 438 · 35,000 → 875
 */
export function computeSocialSecurity(wage: number): number {
  if (!(wage > 0)) return 0
  const base = Math.min(Math.max(wage, SS_MIN_WAGE), SS_MAX_WAGE)
  // toFixed(6) กันค่า .5 พอดีที่ float เก็บเป็น .4999… แล้วถูกปัดลง
  return Math.round(Number((base * SS_RATE).toFixed(6)))
}

export type SocialSecurityPreview =
  | { kind: 'amount'; amount: number }
  | { kind: 'off-system' }
  | { kind: 'hidden' }

/**
 * สรุปว่ากล่อง preview ประกันสังคมในหน้าแก้ไขพนักงานควรโชว์อะไร — ต้องเช็ค
 * taxScheme ด้วย ไม่ใช่แค่ payType/checkbox socialSecurity เฉยๆ (ยืนยันบั๊ก
 * 2026-09-21: taxScheme=OFF_SYSTEM_WHT ทำให้ generate จริงบังคับ SS=0 เสมอ
 * — ดู lib/payroll-totals.ts — แต่กล่อง preview เดิมไม่เช็คตรงนี้เลย เลย
 * โชว์ตัวเลขประกันสังคมผิดๆ ทั้งที่ไม่มี SS จริง เป็นบั๊กเฉพาะการแสดงผล
 * ไม่กระทบยอดที่คำนวณจริงตอน generate)
 */
export function socialSecurityPreview(input: {
  payType: string
  socialSecurityEnabled: boolean
  taxScheme: string
  baseSalary: number
}): SocialSecurityPreview {
  if (input.payType !== 'MONTHLY' || !input.socialSecurityEnabled) return { kind: 'hidden' }
  if (input.taxScheme === 'OFF_SYSTEM_WHT') return { kind: 'off-system' }
  return { kind: 'amount', amount: computeSocialSecurity(input.baseSalary) }
}
