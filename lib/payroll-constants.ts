import { bangkokDateKey } from '@/lib/datetime-bangkok'

/**
 * Social Security Fund — employee contribution (5%, capped monthly).
 * Single source of truth — both the payroll generate route and the employee
 * edit page's SS preview must read from here, not hardcode any number.
 */
export const SS_RATE = 0.05
/** ฐานค่าจ้างขั้นต่ำที่ใช้คิดเงินสมทบ: ค่าจ้างต่ำกว่า 1,650 คิดที่ 1,650 (= 83 บาท) */
export const SS_MIN_WAGE = 1_650

/**
 * เพดานฐานค่าจ้างคิดเงินสมทบ แยกตามปี (ค.ศ. — ตรงกับ Payroll.year) — ปีของ
 * payroll คือปีของเดือนที่ปิดยอด/จ่ายเงิน (ไม่ใช่ปีของวันที่ 21 ต้นรอบ)
 *
 * ยืนยันแล้ว: พ.ศ. 2568 (2025) = 15,000 บาท (สูงสุด 750) — เผื่อคำนวณ payroll ปีเก่าซ้ำ,
 * พ.ศ. 2569–2571 (2026–2028) = 17,500 บาท (เงินสมทบสูงสุด 875)
 * ปีที่ไม่มีในตาราง → ใช้เพดานของปีล่าสุดในตาราง + คำเตือนให้ HR ตรวจสอบ
 * (ssCeilingWarning) — พอทราบเพดานปีใหม่แล้วให้เพิ่มปีนั้นในตารางนี้
 */
export const SS_MAX_WAGE_BY_YEAR: Readonly<Record<number, number>> = Object.freeze({
  2025: 15_000, // พ.ศ. 2568
  2026: 17_500, // พ.ศ. 2569
  2027: 17_500, // พ.ศ. 2570
  2028: 17_500, // พ.ศ. 2571
})

const SS_TABLE_LATEST_YEAR = Math.max(...Object.keys(SS_MAX_WAGE_BY_YEAR).map(Number))

/** เพดานของปีนั้น — inTable=false แปลว่าไม่มีในตาราง ใช้ค่าของปีล่าสุดแทน */
export function ssMaxWageForYear(year: number): { maxWage: number; inTable: boolean; sourceYear: number } {
  const exact = SS_MAX_WAGE_BY_YEAR[year]
  if (exact !== undefined) return { maxWage: exact, inTable: true, sourceYear: year }
  return { maxWage: SS_MAX_WAGE_BY_YEAR[SS_TABLE_LATEST_YEAR], inTable: false, sourceYear: SS_TABLE_LATEST_YEAR }
}

/** ข้อความเตือน HR เมื่อปีของ payroll ไม่มีในตาราง (null = มีในตาราง ไม่ต้องเตือน) */
export function ssCeilingWarning(year: number): string | null {
  const { maxWage, inTable, sourceYear } = ssMaxWageForYear(year)
  if (inTable) return null
  return (
    `⚠️ ยังไม่มีเพดานประกันสังคมของปี พ.ศ. ${year + 543} ในระบบ — ใช้เพดานล่าสุด ` +
    `(พ.ศ. ${sourceYear + 543}: ฿${maxWage.toLocaleString('th-TH')}) ไปก่อน ` +
    `กรุณาตรวจสอบเพดานใหม่ก่อนอนุมัติ และแจ้งผู้ดูแลระบบให้เพิ่มในตาราง`
  )
}

/** ปีปัจจุบัน (ค.ศ.) ตามเวลาไทย — ใช้กับ preview ที่ยังไม่มี payroll ของงวดใด */
export function currentBangkokYear(): number {
  return Number(bangkokDateKey().slice(0, 4))
}

/**
 * เงินสมทบประกันสังคมส่วนลูกจ้างของเดือนนี้ — แหล่งเดียวทั้งระบบ (2026-10)
 * ฐาน = ค่าจ้างที่จ่ายจริง (หลัง prorate) บีบไว้ในช่วง 1,650–เพดานของปีนั้น × 5%
 * ปัดเป็นบาทเต็มแบบ ≥ 0.50 ปัดขึ้น / < 0.50 ปัดทิ้ง ไม่มีค่าจ้างเลย (≤ 0) = 0
 * ตัวอย่าง (เพดาน 17,500): 12,345 → 617 · 800 → 83 · 8,750 → 438 · 35,000 → 875
 *
 * POLICY #9 (ยืนยัน 2026-10-07 — ห้ามเปลี่ยนโดยไม่ถามผู้ใช้, ดู CLAUDE.md § Payroll
 * policy): 5% ของฐาน 1,650–เพดาน ปัดบาทเต็ม ใช้กับรายวันด้วย
 */
export function computeSocialSecurity(wage: number, year: number): number {
  if (!(wage > 0)) return 0
  const base = Math.min(Math.max(wage, SS_MIN_WAGE), ssMaxWageForYear(year).maxWage)
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
  /** ปี (ค.ศ.) ที่ใช้หาเพดาน — ไม่ส่ง = ปีปัจจุบันตามเวลาไทย */
  year?: number
}): SocialSecurityPreview {
  if (input.payType !== 'MONTHLY' || !input.socialSecurityEnabled) return { kind: 'hidden' }
  if (input.taxScheme === 'OFF_SYSTEM_WHT') return { kind: 'off-system' }
  return { kind: 'amount', amount: computeSocialSecurity(input.baseSalary, input.year ?? currentBangkokYear()) }
}
