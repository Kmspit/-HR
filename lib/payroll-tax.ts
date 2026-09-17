/**
 * ภงด1 — Thai Personal Income Tax withholding for salary income
 * Brackets for 2024 (พ.ร.บ.แก้ไขเพิ่มเติมประมวลรัษฎากร)
 */

export type TaxDetail = {
  annualGross: number
  incomeDeduction: number       // 50% of income, max 100,000 baht
  personalAllowance: number     // 60,000 baht personal exemption
  annualSocialSecurity: number  // this month's SS deduction × 12
  taxableIncome: number
  annualTax: number
  monthlyWithholding: number
  /** breakdown เพิ่มโดย lib/payroll-totals.ts เพื่อแยกภาษี 40(1)/40(2) สำหรับ
   * รายงาน/ภ.ง.ด.1 — optional เพราะ taxDetail เก่าก่อน payroll fields batch 2
   * (2026-09) ไม่มี field พวกนี้ */
  salaryIncome40_1?: number
  commissionIncome40_2?: number
  tax40_1?: number
  tax40_2?: number
}

// Progressive brackets: 0 → limit at given rate
const BRACKETS: { limit: number; rate: number }[] = [
  { limit: 150_000,    rate: 0 },
  { limit: 300_000,    rate: 0.05 },
  { limit: 500_000,    rate: 0.10 },
  { limit: 750_000,    rate: 0.15 },
  { limit: 1_000_000,  rate: 0.20 },
  { limit: 2_000_000,  rate: 0.25 },
  { limit: 5_000_000,  rate: 0.30 },
  { limit: Infinity,   rate: 0.35 },
]

function progressiveTax(taxableIncome: number): number {
  let tax = 0
  let prev = 0
  for (const { limit, rate } of BRACKETS) {
    if (taxableIncome <= prev) break
    const chunk = Math.min(taxableIncome, limit) - prev
    tax += chunk * rate
    prev = limit
  }
  return Math.round(tax)
}

/**
 * คำนวณภาษีหัก ณ ที่จ่าย รายเดือน (ภงด1)
 * ใช้เงินได้ 40(1)+40(2) รวมกันเป็นก้อนเดียว (grossIncome = baseSalary +
 * positionAllowance + diligenceAllowance + backPay + commission) → ประมาณ
 * รายปี → คำนวณภาษี → หาร 12 — ต้องรวมเป็นก้อนเดียวก่อนเรียกฟังก์ชันนี้เสมอ
 * (ไม่แยกคำนวณ 2 รอบแล้วบวกทีหลัง) เพื่อไม่ให้เพดาน incomeDeduction
 * (100,000 บาท) ถูกใช้ซ้ำสองรอบ — ค่าวิชาชีพ 40(6) ไม่รวมในนี้ เพราะคำนวณ
 * ภาษีคนละระบบ (3% flat แยกก้อน ดู ProfessionalFeePayment.taxWithheld)
 *
 * @param grossIncome เงินได้ 40(1)+40(2) รวมกันแล้วของเดือนนี้ (ไม่ใช่แค่
 *   baseSalary อีกต่อไป — ชื่อเดิมคงไว้เป็น alias เพื่อ backward-compat)
 * @param socialSecurity เงินสมทบประกันสังคมที่หักของเดือนนี้ (หลังหักเพดาน
 *   SS_MAX แล้ว) — คูณ 12 แล้วหักออกจากเงินได้สุทธิร่วมกับ personalAllowance
 *   ก่อนคำนวณภาษี ตามหลักเงินสมทบประกันสังคมเป็นค่าลดหย่อนได้ตามกฎหมาย
 */
export function computeMonthlyTax(grossIncome: number, socialSecurity: number = 0): TaxDetail {
  if (grossIncome <= 0) {
    return {
      annualGross: 0,
      incomeDeduction: 0,
      personalAllowance: 60_000,
      annualSocialSecurity: 0,
      taxableIncome: 0,
      annualTax: 0,
      monthlyWithholding: 0,
    }
  }

  const annualGross = grossIncome * 12
  const incomeDeduction = Math.min(annualGross * 0.5, 100_000)
  const personalAllowance = 60_000
  const annualSocialSecurity = socialSecurity * 12
  const taxableIncome = Math.max(
    0,
    annualGross - incomeDeduction - personalAllowance - annualSocialSecurity,
  )
  const annualTax = progressiveTax(taxableIncome)
  const monthlyWithholding = Math.round((annualTax / 12) * 100) / 100

  return {
    annualGross,
    incomeDeduction,
    personalAllowance,
    annualSocialSecurity,
    taxableIncome,
    annualTax,
    monthlyWithholding,
  }
}

export function parseTaxDetail(raw: string | null | undefined): TaxDetail | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as TaxDetail
  } catch {
    return null
  }
}
