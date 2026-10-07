import { describe, it, expect } from 'vitest'
import {
  addDaysToKey,
  dateKeyParts,
  daysBetweenKeysInclusive,
  payrollPeriodKeys,
  payrollPeriodRange,
} from '@/lib/payroll-period'

// Every assertion here is on absolute instants / plain date keys, never on
// getDate()/getHours() — so this file gives the same result under TZ=UTC
// (Vercel) and TZ=Asia/Bangkok (dev machines). See lib/payroll-period.ts.

/** How Attendance.date is stored: midnight Bangkok time of that day */
const attendanceDate = (bkkDay: string) => new Date(`${bkkDay}T00:00:00+07:00`)

describe('payrollPeriodRange — anchored to Bangkok time regardless of server TZ', () => {
  it('October 2569 (month=10, 2026) = 21 Sep 00:00 – 20 Oct 23:59:59.999 Bangkok time', () => {
    const { start, end } = payrollPeriodRange(10, 2026)
    expect(start.toISOString()).toBe('2026-09-20T17:00:00.000Z')
    expect(end.toISOString()).toBe('2026-10-20T16:59:59.999Z')
  })

  it('contains attendance for 21 Sep and 20 Oct (Bangkok) and excludes 20 Sep and 21 Oct', () => {
    const { start, end } = payrollPeriodRange(10, 2026)
    const inRange = (d: Date) => d >= start && d <= end
    expect(inRange(attendanceDate('2026-09-20'))).toBe(false)
    expect(inRange(attendanceDate('2026-09-21'))).toBe(true)
    expect(inRange(attendanceDate('2026-10-20'))).toBe(true)
    expect(inRange(attendanceDate('2026-10-21'))).toBe(false)
  })

  it('January (year-boundary case): 21 Dec of the PREVIOUS year – 20 Jan of this year', () => {
    const { start, end } = payrollPeriodRange(1, 2026)
    expect(start.toISOString()).toBe('2025-12-20T17:00:00.000Z')
    expect(end.toISOString()).toBe('2026-01-20T16:59:59.999Z')
  })

  it('December: 21 Nov – 20 Dec, same year', () => {
    expect(payrollPeriodKeys(12, 2026)).toEqual({ startKey: '2026-11-21', endKey: '2026-12-20' })
  })
})

describe('payrollPeriodKeys / day-key helpers', () => {
  it('keys for October 2569 are 2026-09-21 … 2026-10-20', () => {
    expect(payrollPeriodKeys(10, 2026)).toEqual({ startKey: '2026-09-21', endKey: '2026-10-20' })
    expect(payrollPeriodKeys(1, 2026)).toEqual({ startKey: '2025-12-21', endKey: '2026-01-20' })
  })

  it('the period spans 28–31 days depending on the previous month length', () => {
    const span = (m: number, y: number) => {
      const { startKey, endKey } = payrollPeriodKeys(m, y)
      return daysBetweenKeysInclusive(startKey, endKey)
    }
    expect(span(9, 2026)).toBe(31) // 21 Aug – 20 Sep
    expect(span(10, 2026)).toBe(30) // 21 Sep – 20 Oct
    expect(span(3, 2026)).toBe(28) // 21 Feb – 20 Mar (2026 not a leap year)
  })

  it('daysBetweenKeysInclusive / addDaysToKey / dateKeyParts', () => {
    expect(daysBetweenKeysInclusive('2026-09-21', '2026-10-05')).toBe(15)
    expect(daysBetweenKeysInclusive('2026-10-05', '2026-09-21')).toBe(0)
    expect(addDaysToKey('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDaysToKey('2026-01-01', -1)).toBe('2025-12-31')
    expect(dateKeyParts('2026-09-21')).toEqual({ year: 2026, month: 9, day: 21 })
  })
})
