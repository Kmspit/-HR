import { describe, it, expect } from 'vitest'
import { countUnrecordedAbsenceDays, bangkokLastSaturdayKeyOfMonth, type UnrecordedAbsenceParams } from '@/lib/payroll-unrecorded-absence'
import type { HolidayRecord } from '@/lib/company-holidays'

// Verified calendar anchor for this test file: 2026-09-23 is a Wednesday
// (established earlier this session via the attendance-import export
// round-trip tests' dayLabel fixtures). September 2026 Saturdays: 5, 12,
// 19, 26 (26 = last Saturday). Sundays: 6, 13, 20, 27.

function bkk(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00+07:00`)
}

function baseParams(overrides: Partial<UnrecordedAbsenceParams> = {}): UnrecordedAbsenceParams {
  return {
    periodStart: bkk('2026-09-01'),
    periodEnd: bkk('2026-09-30'),
    today: bkk('2026-10-05'), // well after the period — nothing clamped by the today/future rule unless a test overrides it
    attendanceDateKeys: new Set<string>(),
    leaveDateKeys: new Set<string>(),
    holidays: [],
    branchId: null,
    employeeStartDate: null,
    ...overrides,
  }
}

describe('bangkokLastSaturdayKeyOfMonth', () => {
  it('finds the last Saturday of a 30-day month (September 2026)', () => {
    expect(bangkokLastSaturdayKeyOfMonth(2026, 9)).toBe('2026-09-26')
  })

  it('finds the last Saturday of a 31-day month (August 2026, last day is a Monday)', () => {
    // August 2026: Sept 1 is Tuesday, so Aug 31 is Monday; Saturdays: 1,8,15,22,29
    expect(bangkokLastSaturdayKeyOfMonth(2026, 8)).toBe('2026-08-29')
  })

  it('finds the last Saturday of February in a non-leap year (2026, 28 days)', () => {
    // 2026-09-01 = Tuesday. Working backward in whole weeks: Sept1(Tue) -> Aug4(Tue) -> Jul7(Tue) -> Jun9(Tue)...
    // Simpler: verify structurally — result must be a real Saturday within Feb 2026 and within the last 7 days.
    const key = bangkokLastSaturdayKeyOfMonth(2026, 2)
    expect(key.startsWith('2026-02-2')).toBe(true) // last-Saturday of a 28-day Feb is always in the 22-28 range
    const dow = new Date(`${key}T00:00:00Z`).getUTCDay()
    expect(dow).toBe(6)
  })
})

describe('countUnrecordedAbsenceDays — core rule (no data + no approved leave = absent)', () => {
  it('counts a plain working weekday with no attendance and no leave', () => {
    // 2026-09-23 (Wed) alone, isolate via a 1-day period
    const params = baseParams({ periodStart: bkk('2026-09-23'), periodEnd: bkk('2026-09-23') })
    expect(countUnrecordedAbsenceDays(params)).toBe(1)
  })

  it('does not count a day that already has an Attendance row (any status)', () => {
    const params = baseParams({
      periodStart: bkk('2026-09-23'), periodEnd: bkk('2026-09-23'),
      attendanceDateKeys: new Set(['2026-09-23']),
    })
    expect(countUnrecordedAbsenceDays(params)).toBe(0)
  })

  it('does not count a day covered by an APPROVED leave', () => {
    const params = baseParams({
      periodStart: bkk('2026-09-23'), periodEnd: bkk('2026-09-23'),
      leaveDateKeys: new Set(['2026-09-23']),
    })
    expect(countUnrecordedAbsenceDays(params)).toBe(0)
  })

  it('DOES count a day whose only leave request is PENDING (not in leaveDateKeys, since buildApprovedLeaveDateSet already filters to APPROVED/ADMIN_APPROVED only)', () => {
    // Simulated by simply not including the date — a pending leave never
    // makes it into leaveDateKeys in the first place (confirmed from
    // buildApprovedLeaveDateSet's own APPROVED_LEAVE_STATUSES filter).
    const params = baseParams({ periodStart: bkk('2026-09-23'), periodEnd: bkk('2026-09-23') })
    expect(countUnrecordedAbsenceDays(params)).toBe(1)
  })

  it('does not count a day before the employee\'s startDate', () => {
    const params = baseParams({
      periodStart: bkk('2026-09-01'), periodEnd: bkk('2026-09-05'),
      employeeStartDate: bkk('2026-09-04'),
    })
    // Sept 1(Tue),2(Wed),3(Thu) excluded (before hire); 4(Fri) counted; 5(Sat, regular, no config) excluded as weekend
    expect(countUnrecordedAbsenceDays(params)).toBe(1)
  })

  it('does not count today or future days (payroll generated before the period actually finished)', () => {
    const params = baseParams({
      periodStart: bkk('2026-09-23'), periodEnd: bkk('2026-09-25'),
      today: bkk('2026-09-24'), // "now" is the 24th — only the 23rd (yesterday) is eligible
    })
    expect(countUnrecordedAbsenceDays(params)).toBe(1)
  })

  it('does not count a real PUBLIC_HOLIDAY', () => {
    const holidays: HolidayRecord[] = [
      { id: 'h1', holidayName: 'วันหยุดทดสอบ', holidayDate: bkk('2026-09-23'), holidayType: 'PUBLIC_HOLIDAY', repeatEveryYear: false, branchId: null },
    ]
    const params = baseParams({ periodStart: bkk('2026-09-23'), periodEnd: bkk('2026-09-23'), holidays })
    expect(countUnrecordedAbsenceDays(params)).toBe(0)
  })

  it('returns 0 for a fully-attended period (regression — every working day already has a row)', () => {
    const dateKeys = ['2026-09-23', '2026-09-24', '2026-09-25']
    const params = baseParams({
      periodStart: bkk('2026-09-23'), periodEnd: bkk('2026-09-25'),
      attendanceDateKeys: new Set(dateKeys),
    })
    expect(countUnrecordedAbsenceDays(params)).toBe(0)
  })
})

describe('countUnrecordedAbsenceDays — weekend fallback (no SATURDAY/SUNDAY holiday config)', () => {
  it('treats a regular Saturday as a day off (not counted) when no data exists', () => {
    const params = baseParams({ periodStart: bkk('2026-09-19'), periodEnd: bkk('2026-09-19') }) // a non-last Saturday
    expect(countUnrecordedAbsenceDays(params)).toBe(0)
  })

  it('treats Sunday as a day off (not counted) when no data exists', () => {
    const params = baseParams({ periodStart: bkk('2026-09-20'), periodEnd: bkk('2026-09-20') })
    expect(countUnrecordedAbsenceDays(params)).toBe(0)
  })

  it('COUNTS the last Saturday of the month as a working day when no data/leave exists (company rule)', () => {
    const params = baseParams({ periodStart: bkk('2026-09-26'), periodEnd: bkk('2026-09-26') })
    expect(countUnrecordedAbsenceDays(params)).toBe(1)
  })

  it('does not count the OTHER Saturdays of the same month even though the last one counts', () => {
    const params = baseParams({ periodStart: bkk('2026-09-01'), periodEnd: bkk('2026-09-30') })
    // Only weekdays (no holiday config beyond the Sat/Sun fallback) + last Saturday (26) count.
    // September 2026 has 22 weekdays (Mon-Fri) + 1 (last Saturday, 26th) = 23 unrecorded-absence days total.
    expect(countUnrecordedAbsenceDays(params)).toBe(23)
  })

  it('a real PUBLIC_HOLIDAY landing exactly on the last Saturday still wins (not counted)', () => {
    const holidays: HolidayRecord[] = [
      { id: 'h1', holidayName: 'วันหยุดพิเศษ', holidayDate: bkk('2026-09-26'), holidayType: 'PUBLIC_HOLIDAY', repeatEveryYear: false, branchId: null },
    ]
    const params = baseParams({ periodStart: bkk('2026-09-26'), periodEnd: bkk('2026-09-26'), holidays })
    expect(countUnrecordedAbsenceDays(params)).toBe(0)
  })

  it('does NOT apply the last-Saturday exception once a real SATURDAY-type holiday record exists — every Saturday follows real config', () => {
    const holidays: HolidayRecord[] = [
      { id: 'h1', holidayName: 'วันเสาร์หยุด', holidayDate: bkk('2026-01-01'), holidayType: 'SATURDAY', repeatEveryYear: true, branchId: null },
    ]
    const params = baseParams({ periodStart: bkk('2026-09-26'), periodEnd: bkk('2026-09-26'), holidays })
    expect(countUnrecordedAbsenceDays(params)).toBe(0) // last Saturday now also off, per real config
  })

  it('respects real config when only some Saturdays are configured as holidays (non-repeating, specific dates)', () => {
    const holidays: HolidayRecord[] = [
      { id: 'h1', holidayName: 'วันเสาร์พิเศษ', holidayDate: bkk('2026-09-19'), holidayType: 'SATURDAY', repeatEveryYear: false, branchId: null },
    ]
    // hasSaturdayConfig is true (a SATURDAY-type record exists at all), so
    // the fallback/last-Saturday exception never applies — every Saturday
    // not explicitly matched by getHolidayForDate is treated as a normal
    // working day (real config governs, no guessing).
    const params = baseParams({ periodStart: bkk('2026-09-26'), periodEnd: bkk('2026-09-26'), holidays })
    expect(countUnrecordedAbsenceDays(params)).toBe(1) // Sept 26 not the configured date -> working day -> counted
  })
})
