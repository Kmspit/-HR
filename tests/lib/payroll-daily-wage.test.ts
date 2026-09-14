import { describe, it, expect } from 'vitest'
import { computeDaysWorked } from '@/lib/payroll-daily-wage'

function att(status: string, checkIn: Date | null = new Date('2026-09-01T08:00:00Z')) {
  return { status, checkIn }
}

describe('computeDaysWorked', () => {
  it('counts NORMAL/LATE/EARLY_LEAVE/OT as a full day each', () => {
    const days = computeDaysWorked([
      att('NORMAL'), att('LATE'), att('EARLY_LEAVE'), att('OT'),
    ])
    expect(days).toBe(4)
  })

  it('counts HALF_DAY as 0.5', () => {
    expect(computeDaysWorked([att('HALF_DAY')])).toBe(0.5)
  })

  it('mixes full and half days correctly', () => {
    const days = computeDaysWorked([att('NORMAL'), att('HALF_DAY'), att('LATE'), att('HALF_DAY')])
    expect(days).toBe(3) // 1 + 0.5 + 1 + 0.5
  })

  it('does not count LEAVE even with a checkIn present (partial-day leave with a real check-in)', () => {
    expect(computeDaysWorked([att('LEAVE')])).toBe(0)
  })

  it('does not count ABSENT', () => {
    expect(computeDaysWorked([att('ABSENT')])).toBe(0)
  })

  it('does not count a row with no checkIn at all, regardless of status', () => {
    expect(computeDaysWorked([att('NORMAL', null), att('HALF_DAY', null)])).toBe(0)
  })

  it('returns 0 for an empty attendance list', () => {
    expect(computeDaysWorked([])).toBe(0)
  })

  it('ignores unrecognized statuses (counts as 0, not a crash)', () => {
    expect(computeDaysWorked([att('SOME_FUTURE_STATUS')])).toBe(0)
  })
})
