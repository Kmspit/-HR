import { describe, it, expect } from 'vitest'
import {
  SS_MAX_WAGE_BY_YEAR,
  computeSocialSecurity,
  ssCeilingWarning,
  ssMaxWageForYear,
} from '@/lib/payroll-constants'
import { computePayrollTotals, type PayrollTotalsInput } from '@/lib/payroll-totals'

function totalsInput(overrides: Partial<PayrollTotalsInput>): PayrollTotalsInput {
  return {
    year: 2026,
    baseSalary: 30_000, positionAllowance: 0, diligenceAllowance: 0, backPay: 0, commission: 0,
    overtimePay: 0, bonus: 0, professionalFee: 0, professionalFeeTax: 0, studentLoanDeduction: 0,
    securityDepositDeduction: 0, lateDeduction: 0, absentDeduction: 0, unpaidLeaveDeduction: 0,
    earlyLeaveDeduction: 0, socialSecurityEnabled: true, taxScheme: 'NORMAL',
    ...overrides,
  }
}

describe('SS ceiling table by year (พ.ศ. 2568 = 15,000, 2569–2571 = 17,500)', () => {
  it('has exactly 2025 (= พ.ศ. 2568) at 15,000 and 2026–2028 (= พ.ศ. 2569–2571) at 17,500', () => {
    expect(SS_MAX_WAGE_BY_YEAR).toEqual({ 2025: 15_000, 2026: 17_500, 2027: 17_500, 2028: 17_500 })
    expect(Object.isFrozen(SS_MAX_WAGE_BY_YEAR)).toBe(true)
  })

  it.each([2026, 2027, 2028])('%d is in the table → no warning', (year) => {
    expect(ssMaxWageForYear(year)).toEqual({ maxWage: 17_500, inTable: true, sourceYear: year })
    expect(ssCeilingWarning(year)).toBeNull()
    expect(computeSocialSecurity(35_000, year)).toBe(875)
  })

  it('2025 (พ.ศ. 2568) uses its own 15,000 ceiling → max 750, no warning', () => {
    expect(ssMaxWageForYear(2025)).toEqual({ maxWage: 15_000, inTable: true, sourceYear: 2025 })
    expect(ssCeilingWarning(2025)).toBeNull()
    expect(computeSocialSecurity(35_000, 2025)).toBe(750)
    expect(computeSocialSecurity(12_345, 2025)).toBe(617) // below both ceilings → unchanged
  })

  it.each([2029, 2035, 2024])('%d is not in the table → latest year (2028) ceiling + warning', (year) => {
    expect(ssMaxWageForYear(year)).toEqual({ maxWage: 17_500, inTable: false, sourceYear: 2028 })
    expect(computeSocialSecurity(35_000, year)).toBe(875)
    const w = ssCeilingWarning(year)
    expect(w).toContain(`พ.ศ. ${year + 543}`)
    expect(w).toContain('พ.ศ. 2571')
    expect(w).toContain('17,500')
    expect(w).toContain('ตรวจสอบเพดานใหม่')
  })

  it('floor 1,650 and whole-baht rounding still apply regardless of year', () => {
    expect(computeSocialSecurity(800, 2026)).toBe(83)
    expect(computeSocialSecurity(800, 2030)).toBe(83)
    expect(computeSocialSecurity(8_750, 2030)).toBe(438)
    expect(computeSocialSecurity(0, 2030)).toBe(0)
  })
})

describe('computePayrollTotals — ssCeilingWarning', () => {
  it('null when the payroll year is in the table', () => {
    expect(computePayrollTotals(totalsInput({ year: 2027 })).ssCeilingWarning).toBeNull()
  })

  it('set when the year is not in the table and SS is actually computed', () => {
    const t = computePayrollTotals(totalsInput({ year: 2029 }))
    expect(t.socialSecurity).toBe(875)
    expect(t.ssCeilingWarning).toContain('พ.ศ. 2572')
  })

  it('null when SS does not apply (checkbox off / OFF_SYSTEM_WHT) — the ceiling is irrelevant', () => {
    expect(computePayrollTotals(totalsInput({ year: 2029, socialSecurityEnabled: false })).ssCeilingWarning).toBeNull()
    expect(computePayrollTotals(totalsInput({ year: 2029, taxScheme: 'OFF_SYSTEM_WHT' })).ssCeilingWarning).toBeNull()
  })
})
