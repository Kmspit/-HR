import { describe, it, expect } from 'vitest'
import { computePayrollTotals, type PayrollTotalsInput } from '@/lib/payroll-totals'

function baseInput(overrides: Partial<PayrollTotalsInput> = {}): PayrollTotalsInput {
  return {
    taxSsBaseSalary: 30_000,
    payoutBaseSalary: 30_000,
    positionAllowance: 0,
    diligenceAllowance: 0,
    backPay: 0,
    commission: 0,
    overtimePay: 0,
    bonus: 0,
    professionalFee: 0,
    professionalFeeTax: 0,
    studentLoanDeduction: 0,
    securityDepositDeduction: 0,
    lateDeduction: 0,
    absentDeduction: 0,
    unpaidLeaveDeduction: 0,
    earlyLeaveDeduction: 0,
    socialSecurityEnabled: true,
    ...overrides,
  }
}

describe('computePayrollTotals — taxScheme=NORMAL (backward-compat, unchanged from before OT/bonus/taxScheme)', () => {
  it('defaults to NORMAL when taxScheme is omitted — same numbers as before this feature', () => {
    const withScheme = computePayrollTotals(baseInput({ taxScheme: 'NORMAL' }))
    const withoutScheme = computePayrollTotals(baseInput())
    expect(withoutScheme).toEqual(withScheme)
  })

  it('SS still calculated normally when socialSecurityEnabled and taxScheme=NORMAL', () => {
    const result = computePayrollTotals(baseInput({ taxScheme: 'NORMAL' }))
    expect(result.socialSecurity).toBeGreaterThan(0)
  })
})

describe('computePayrollTotals — OT/bonus enter the tax base but never the SS base (confirmed 2026-09, all taxSchemes)', () => {
  it('OT/bonus increase taxDeduction (via grossIncome) but leave socialSecurity unchanged', () => {
    const without = computePayrollTotals(baseInput({ taxScheme: 'NORMAL' }))
    const withOtBonus = computePayrollTotals(
      baseInput({ taxScheme: 'NORMAL', overtimePay: 5_000, bonus: 10_000 }),
    )
    expect(withOtBonus.socialSecurity).toBe(without.socialSecurity)
    expect(withOtBonus.taxDeduction).toBeGreaterThan(without.taxDeduction)
  })

  it('OT/bonus add directly into netSalary', () => {
    const without = computePayrollTotals(baseInput({ taxScheme: 'NORMAL' }))
    const withOtBonus = computePayrollTotals(
      baseInput({ taxScheme: 'NORMAL', overtimePay: 5_000, bonus: 10_000 }),
    )
    // netSalary difference = 15,000 minus the extra tax withheld from the bigger gross
    const extraTax = withOtBonus.taxDeduction - without.taxDeduction
    expect(withOtBonus.netSalary).toBeCloseTo(without.netSalary + 15_000 - extraTax, 2)
  })

  it('OT/bonus never enter the SS base even when combined with backPay (which does enter SS base)', () => {
    const backPayOnly = computePayrollTotals(baseInput({ taxScheme: 'NORMAL', backPay: 2_000 }))
    const backPayPlusOtBonus = computePayrollTotals(
      baseInput({ taxScheme: 'NORMAL', backPay: 2_000, overtimePay: 3_000, bonus: 4_000 }),
    )
    expect(backPayPlusOtBonus.socialSecurity).toBe(backPayOnly.socialSecurity)
  })
})

describe('computePayrollTotals — taxScheme=OFF_SYSTEM_WHT (ยืนยัน 2026-09)', () => {
  it('forces socialSecurity to 0 even when socialSecurityEnabled is true', () => {
    const result = computePayrollTotals(
      baseInput({ taxScheme: 'OFF_SYSTEM_WHT', socialSecurityEnabled: true }),
    )
    expect(result.socialSecurity).toBe(0)
  })

  it('uses the flat 3% withholding formula instead of the progressive bracket tax', () => {
    const normal = computePayrollTotals(baseInput({ taxScheme: 'NORMAL', socialSecurityEnabled: false }))
    const offSystem = computePayrollTotals(baseInput({ taxScheme: 'OFF_SYSTEM_WHT' }))
    // grossIncome = 30,000 → flat 3% = 900, vs. progressive-bracket withholding (different number)
    expect(offSystem.taxDeduction).toBe(900)
    expect(offSystem.taxDeduction).not.toBe(normal.taxDeduction)
  })

  it('below the 1,000-baht threshold, withholds nothing at all', () => {
    const result = computePayrollTotals(
      baseInput({ taxScheme: 'OFF_SYSTEM_WHT', taxSsBaseSalary: 500, payoutBaseSalary: 500 }),
    )
    expect(result.taxDeduction).toBe(0)
  })

  it('OT/bonus still enter the flat-WHT tax base, but never the (forced-zero) SS base', () => {
    const withoutOt = computePayrollTotals(baseInput({ taxScheme: 'OFF_SYSTEM_WHT' }))
    const withOt = computePayrollTotals(baseInput({ taxScheme: 'OFF_SYSTEM_WHT', overtimePay: 2_000 }))
    expect(withOt.socialSecurity).toBe(0)
    expect(withOt.taxDeduction).toBeGreaterThan(withoutOt.taxDeduction)
  })
})
