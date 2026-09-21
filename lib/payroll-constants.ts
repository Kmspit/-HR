/**
 * Social Security Fund — employee contribution (5%, capped monthly).
 * Ceiling wage base raised 15,000 → 17,500 THB/month, effective 2026-01-01
 * through 2028-12-31 (confirmed), so the 5% cap rises 750 → 875 THB/month.
 * Single source of truth — both the payroll generate route and the employee
 * edit page's SS preview must read from here, not hardcode either number.
 */
export const SS_RATE = 0.05
export const SS_MAX = 875

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
  return { kind: 'amount', amount: Math.min(input.baseSalary * SS_RATE, SS_MAX) }
}
