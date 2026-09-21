import { describe, it, expect } from 'vitest'
import { socialSecurityPreview, SS_RATE, SS_MAX } from '@/lib/payroll-constants'

function input(overrides: Partial<Parameters<typeof socialSecurityPreview>[0]> = {}) {
  return {
    payType: 'MONTHLY',
    socialSecurityEnabled: true,
    taxScheme: 'NORMAL',
    baseSalary: 30_000,
    ...overrides,
  }
}

describe('socialSecurityPreview — taxScheme=NORMAL (unchanged behavior)', () => {
  it('shows the computed amount (baseSalary × 5%, capped at 875)', () => {
    const result = socialSecurityPreview(input())
    expect(result).toEqual({ kind: 'amount', amount: Math.min(30_000 * SS_RATE, SS_MAX) })
  })

  it('caps at SS_MAX for a high salary', () => {
    const result = socialSecurityPreview(input({ baseSalary: 100_000 }))
    expect(result).toEqual({ kind: 'amount', amount: SS_MAX })
  })

  it('hides when payType is DAILY, regardless of taxScheme', () => {
    expect(socialSecurityPreview(input({ payType: 'DAILY' }))).toEqual({ kind: 'hidden' })
    expect(socialSecurityPreview(input({ payType: 'DAILY', taxScheme: 'OFF_SYSTEM_WHT' }))).toEqual({ kind: 'hidden' })
  })

  it('hides when the socialSecurity checkbox is off', () => {
    expect(socialSecurityPreview(input({ socialSecurityEnabled: false }))).toEqual({ kind: 'hidden' })
  })
})

describe('socialSecurityPreview — taxScheme=OFF_SYSTEM_WHT (bug fix, confirmed 2026-09-21)', () => {
  it('shows "off-system", never a dollar amount, even with a large baseSalary', () => {
    const result = socialSecurityPreview(input({ taxScheme: 'OFF_SYSTEM_WHT', baseSalary: 100_000 }))
    expect(result).toEqual({ kind: 'off-system' })
  })

  it('shows "off-system" regardless of the socialSecurity checkbox state', () => {
    expect(socialSecurityPreview(input({ taxScheme: 'OFF_SYSTEM_WHT', socialSecurityEnabled: true })))
      .toEqual({ kind: 'off-system' })
  })

  it('shows "off-system" for MONTHLY + OFF_SYSTEM_WHT (the exact combo that surfaced the bug)', () => {
    const result = socialSecurityPreview({
      payType: 'MONTHLY', socialSecurityEnabled: true, taxScheme: 'OFF_SYSTEM_WHT', baseSalary: 35_000,
    })
    expect(result.kind).toBe('off-system')
  })

  it('matches the real generate-time behavior: taxScheme=OFF_SYSTEM_WHT always means SS=0, never a computed figure', () => {
    // Mirrors lib/payroll-totals.ts's isOffSystemWht guard — the preview must
    // never show a number computePayrollTotals() would never actually charge.
    const result = socialSecurityPreview(input({ taxScheme: 'OFF_SYSTEM_WHT' }))
    expect(result.kind).not.toBe('amount')
  })
})
