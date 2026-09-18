import { describe, it, expect } from 'vitest'
import { payrollPeriodRange } from '@/lib/payroll-period'

describe('payrollPeriodRange', () => {
  it('September (normal, same-year case): 21 Aug – 20 Sep', () => {
    const { start, end } = payrollPeriodRange(9, 2026)

    expect(start.getFullYear()).toBe(2026)
    expect(start.getMonth()).toBe(7) // August (0-indexed)
    expect(start.getDate()).toBe(21)
    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)
    expect(start.getSeconds()).toBe(0)
    expect(start.getMilliseconds()).toBe(0)

    expect(end.getFullYear()).toBe(2026)
    expect(end.getMonth()).toBe(8) // September
    expect(end.getDate()).toBe(20)
    expect(end.getHours()).toBe(23)
    expect(end.getMinutes()).toBe(59)
    expect(end.getSeconds()).toBe(59)
    expect(end.getMilliseconds()).toBe(999)
  })

  it('January (year-boundary case): 21 Dec of the PREVIOUS year – 20 Jan of this year', () => {
    const { start, end } = payrollPeriodRange(1, 2026)

    expect(start.getFullYear()).toBe(2025) // previous year
    expect(start.getMonth()).toBe(11) // December
    expect(start.getDate()).toBe(21)

    expect(end.getFullYear()).toBe(2026)
    expect(end.getMonth()).toBe(0) // January
    expect(end.getDate()).toBe(20)
  })

  it('December (sanity check at the other end of the year): 21 Nov – 20 Dec, same year', () => {
    const { start, end } = payrollPeriodRange(12, 2026)

    expect(start.getFullYear()).toBe(2026)
    expect(start.getMonth()).toBe(10) // November
    expect(start.getDate()).toBe(21)

    expect(end.getFullYear()).toBe(2026)
    expect(end.getMonth()).toBe(11) // December
    expect(end.getDate()).toBe(20)
  })

  it('the period always spans exactly 31 or 28 days depending on the previous month length', () => {
    // Inclusive calendar-day count, ignoring time-of-day (matches the codebase's
    // own daysBetweenInclusive helper in app/api/payroll/generate/route.ts).
    function inclusiveDayCount(start: Date, end: Date): number {
      const a = new Date(start.getFullYear(), start.getMonth(), start.getDate())
      const b = new Date(end.getFullYear(), end.getMonth(), end.getDate())
      return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1
    }

    // August has 31 days, so 21 Aug -> 20 Sep spans 31 days inclusive.
    const sep = payrollPeriodRange(9, 2026)
    expect(inclusiveDayCount(sep.start, sep.end)).toBe(31)

    // February (28 days in 2026, not a leap year) -> 21 Feb -> 20 Mar spans 28 days.
    const mar = payrollPeriodRange(3, 2026)
    expect(inclusiveDayCount(mar.start, mar.end)).toBe(28)
  })
})
