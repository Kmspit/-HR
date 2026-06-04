/**
 * ภงด1 — Thai Personal Income Tax withholding for salary income
 * Brackets for 2024 (พ.ร.บ.แก้ไขเพิ่มเติมประมวลรัษฎากร)
 */

export type TaxDetail = {
  annualGross: number
  incomeDeduction: number       // 50% of income, max 100,000 baht
  personalAllowance: number     // 60,000 baht personal exemption
  taxableIncome: number
  annualTax: number
  monthlyWithholding: number
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
 * ใช้เงินเดือนฐานรายเดือน → ประมาณรายปี → คำนวณภาษี → หาร 12
 */
export function computeMonthlyTax(baseSalary: number): TaxDetail {
  if (baseSalary <= 0) {
    return {
      annualGross: 0,
      incomeDeduction: 0,
      personalAllowance: 60_000,
      taxableIncome: 0,
      annualTax: 0,
      monthlyWithholding: 0,
    }
  }

  const annualGross = baseSalary * 12
  const incomeDeduction = Math.min(annualGross * 0.5, 100_000)
  const personalAllowance = 60_000
  const taxableIncome = Math.max(0, annualGross - incomeDeduction - personalAllowance)
  const annualTax = progressiveTax(taxableIncome)
  const monthlyWithholding = Math.round((annualTax / 12) * 100) / 100

  return {
    annualGross,
    incomeDeduction,
    personalAllowance,
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
