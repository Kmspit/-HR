import { describe, it, expect } from 'vitest'
import { computeMonthlyTax } from '@/lib/payroll-tax'

describe('computeMonthlyTax', () => {
  it('returns all zeros for baseSalary <= 0, regardless of socialSecurity', () => {
    const result = computeMonthlyTax(0, 500)
    expect(result).toEqual({
      annualGross: 0,
      incomeDeduction: 0,
      personalAllowance: 60_000,
      annualSocialSecurity: 0,
      taxableIncome: 0,
      annualTax: 0,
      monthlyWithholding: 0,
    })
  })

  it('defaults socialSecurity to 0 when omitted (backward-compatible call shape)', () => {
    const withDefault = computeMonthlyTax(30_000)
    const withExplicitZero = computeMonthlyTax(30_000, 0)
    expect(withDefault).toEqual(withExplicitZero)
    expect(withDefault.annualSocialSecurity).toBe(0)
  })

  it('subtracts annualized social security from taxable income, lowering tax vs. no SS', () => {
    const withoutSS = computeMonthlyTax(30_000, 0)
    const withSS = computeMonthlyTax(30_000, 875)

    expect(withSS.taxableIncome).toBeLessThan(withoutSS.taxableIncome)
    expect(withSS.annualTax).toBeLessThan(withoutSS.annualTax)
    expect(withSS.monthlyWithholding).toBeLessThan(withoutSS.monthlyWithholding)
  })

  it('confirmed example: บาท 30,000/เดือน, SS ที่เพดานใหม่ (875) — คำนวณภาษีตามสูตรที่แก้', () => {
    // annualGross = 30,000 × 12 = 360,000
    // incomeDeduction = min(360,000 × 50%, 100,000) = 100,000
    // personalAllowance = 60,000
    // annualSocialSecurity = 875 × 12 = 10,500
    // taxableIncome = 360,000 - 100,000 - 60,000 - 10,500 = 189,500
    // annualTax: 0% on first 150,000; 5% on (189,500 - 150,000) = 39,500 × 5% = 1,975
    // monthlyWithholding = round(1975 / 12 × 100) / 100 = 164.58
    const result = computeMonthlyTax(30_000, 875)

    expect(result.annualGross).toBe(360_000)
    expect(result.incomeDeduction).toBe(100_000)
    expect(result.personalAllowance).toBe(60_000)
    expect(result.annualSocialSecurity).toBe(10_500)
    expect(result.taxableIncome).toBe(189_500)
    expect(result.annualTax).toBe(1_975)
    expect(result.monthlyWithholding).toBe(164.58)
  })

  it('never lets social security push taxableIncome below zero', () => {
    // A tiny salary with a (hypothetically) large SS figure must clamp at 0, not go negative.
    const result = computeMonthlyTax(5_000, 875)
    expect(result.taxableIncome).toBe(0)
    expect(result.annualTax).toBe(0)
    expect(result.monthlyWithholding).toBe(0)
  })
})
