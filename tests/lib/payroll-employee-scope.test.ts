import { describe, it, expect } from 'vitest'
import { payrollEligibleUserWhere, payrollEligibleUserWhereForRange, PAYROLL_ROLES } from '@/lib/payroll-employee-scope'
import { payrollPeriodRange } from '@/lib/payroll-period'

/**
 * Single source of truth for "who belongs in this payroll period", shared by
 * generate/route.ts, app/(dashboard)/payroll/page.tsx and GET
 * /api/payroll/report (bug 2026-10-02: the two read paths had drifted to
 * ACTIVE-only and never showed a disabled-mid-period employee's row).
 *
 * 2026-10 (fix/payroll-formulas-round1): startDate after the period → not in
 * it; lastWorkingDate decides which period a leaver belongs to; updatedAt is
 * only a fallback for DISABLED rows that have no lastWorkingDate yet.
 */

type Row = {
  role: string
  status: string
  startDate: Date | null
  lastWorkingDate: Date | null
  updatedAt: Date
}

// Minimal evaluator for the exact Prisma where-shape this helper produces —
// lets the tests below assert real boundary behavior, not just object shape.
function matches(where: any, row: Row): boolean {
  return Object.entries(where).every(([key, cond]: [string, any]) => {
    if (key === 'AND') return (cond as any[]).every((w) => matches(w, row))
    if (key === 'OR') return (cond as any[]).some((w) => matches(w, row))
    const v = (row as any)[key]
    if (cond === null) return v === null
    if (typeof cond !== 'object' || cond instanceof Date) return v === cond
    if ('in' in cond) return cond.in.includes(v)
    if (v === null) return false
    if ('gte' in cond && !(v >= cond.gte)) return false
    if ('lte' in cond && !(v <= cond.lte)) return false
    return true
  })
}

const OCT_2026 = payrollEligibleUserWhere(10, 2026) // 21 Sep – 20 Oct 2026 (Bangkok)
const base: Row = {
  role: 'EMPLOYEE',
  status: 'ACTIVE',
  startDate: new Date('2020-01-01'),
  lastWorkingDate: null,
  updatedAt: new Date('2026-01-01T00:00:00Z'),
}

describe('payrollEligibleUserWhereForRange — shape', () => {
  it('payroll roles, ACTIVE/DISABLED, startDate ≤ end, and lastWorkingDate ≥ start (updatedAt fallback only without it)', () => {
    const start = new Date('2026-09-21T00:00:00.000+07:00')
    const end = new Date('2026-10-20T23:59:59.999+07:00')

    expect(payrollEligibleUserWhereForRange(start, end)).toEqual({
      role: { in: [...PAYROLL_ROLES] },
      status: { in: ['ACTIVE', 'DISABLED'] },
      AND: [
        { OR: [{ startDate: null }, { startDate: { lte: end } }] },
        {
          OR: [
            { lastWorkingDate: { gte: start } },
            { lastWorkingDate: null, status: 'ACTIVE' },
            { lastWorkingDate: null, status: 'DISABLED', updatedAt: { gte: start, lte: end } },
          ],
        },
      ],
    })
  })

  it('payrollEligibleUserWhere(month, year) = ForRange(payrollPeriodRange(month, year))', () => {
    const { start, end } = payrollPeriodRange(10, 2026)
    expect(OCT_2026).toEqual(payrollEligibleUserWhereForRange(start, end))
  })
})

describe('payrollEligibleUserWhere(10, 2026) — real boundaries (21 Sep – 20 Oct, Bangkok)', () => {
  it('a normal ACTIVE employee is in', () => {
    expect(matches(OCT_2026, base)).toBe(true)
  })

  it('PENDING / non-payroll roles are out', () => {
    expect(matches(OCT_2026, { ...base, status: 'PENDING' })).toBe(false)
    expect(matches(OCT_2026, { ...base, role: 'CEO' })).toBe(false)
  })

  it('startDate: starting on the last day of the period (20 Oct) is in, starting the day after (21 Oct) is out — no payroll this period', () => {
    expect(matches(OCT_2026, { ...base, startDate: new Date('2026-10-20') })).toBe(true)
    expect(matches(OCT_2026, { ...base, startDate: new Date('2026-10-21') })).toBe(false)
    // same answer when the date was stored as Bangkok midnight instead of UTC midnight
    expect(matches(OCT_2026, { ...base, startDate: new Date('2026-10-21T00:00:00+07:00') })).toBe(false)
  })

  it('no startDate at all is still in (generate warns HR instead)', () => {
    expect(matches(OCT_2026, { ...base, startDate: null })).toBe(true)
  })

  it('lastWorkingDate: last day on 21 Sep (first day of the period) is in, on 20 Sep (previous period) is out', () => {
    expect(matches(OCT_2026, { ...base, status: 'DISABLED', lastWorkingDate: new Date('2026-09-21') })).toBe(true)
    expect(matches(OCT_2026, { ...base, status: 'DISABLED', lastWorkingDate: new Date('2026-09-20') })).toBe(false)
  })

  it('lastWorkingDate wins over updatedAt — a leaver from August whose record was edited in October stays out', () => {
    const editedLater = { ...base, status: 'DISABLED', lastWorkingDate: new Date('2026-08-15'), updatedAt: new Date('2026-10-02T01:59:46Z') }
    expect(matches(OCT_2026, editedLater)).toBe(false)
  })

  it('an ACTIVE employee serving notice with a future lastWorkingDate is in', () => {
    expect(matches(OCT_2026, { ...base, lastWorkingDate: new Date('2026-11-30') })).toBe(true)
  })

  it('fallback: DISABLED with no lastWorkingDate is in only if updatedAt falls inside the period (isrwd.bml@gmail.com 2026-10-02 case)', () => {
    const disabled = { ...base, status: 'DISABLED' }
    expect(matches(OCT_2026, { ...disabled, updatedAt: new Date('2026-10-02T01:59:46.462Z') })).toBe(true)
    expect(matches(OCT_2026, { ...disabled, updatedAt: new Date('2026-08-01T00:00:00.000Z') })).toBe(false)
  })
})
