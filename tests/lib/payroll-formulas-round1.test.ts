import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: { payroll: { findMany: vi.fn().mockResolvedValue([]) } } }))

import { prisma } from '@/lib/prisma'
import { payrollPeriodKeys, payrollPeriodRange } from '@/lib/payroll-period'
import { computeSocialSecurity } from '@/lib/payroll-constants'
import { computeLateDeduction } from '@/lib/payroll-late-deduction'
import {
  computeEarlyLeaveDeduction,
  computeMonthlyProration,
  dailyWageRate,
  leaveDaysWithinPeriod,
  perDayDeduction,
  perMinuteWageRate,
} from '@/lib/payroll-deductions'
import { computePayrollTotals, monthlyTaxOverrideFromTaxDetail, type PayrollTotalsInput } from '@/lib/payroll-totals'
import { countUnrecordedAbsenceDays } from '@/lib/payroll-unrecorded-absence'
import { computeMonthlyTax, parseTaxDetail } from '@/lib/payroll-tax'
import { computePayrollYtd } from '@/lib/payroll-ytd'
import { buildPayslipLineItems } from '@/lib/payslip-line-items'

/**
 * fix/payroll-formulas-round1 (2026-10) — one test per agreed rule, using the
 * exact example figures from the spec. This whole file must pass identically
 * under TZ=UTC and TZ=Asia/Bangkok.
 */

const OCT = payrollPeriodKeys(10, 2026) // 21 Sep – 20 Oct 2026
const { start: OCT_START, end: OCT_END } = payrollPeriodRange(10, 2026)
const bkk = (day: string) => new Date(`${day}T00:00:00+07:00`) // how Attendance.date is stored
const attendance = (day: string, extra: { lateMinutes?: number; earlyLeaveMinutes?: number } = {}) => ({
  date: bkk(day),
  status: extra.lateMinutes ? 'LATE' : extra.earlyLeaveMinutes ? 'EARLY_LEAVE' : 'NORMAL',
  lateMinutes: extra.lateMinutes ?? 0,
  earlyLeaveMinutes: extra.earlyLeaveMinutes ?? 0,
})
const noLeave = new Set<string>()

function totalsInput(overrides: Partial<PayrollTotalsInput>): PayrollTotalsInput {
  return {
    baseSalary: 0, positionAllowance: 0, diligenceAllowance: 0, backPay: 0, commission: 0,
    overtimePay: 0, bonus: 0, professionalFee: 0, professionalFeeTax: 0, studentLoanDeduction: 0,
    securityDepositDeduction: 0, lateDeduction: 0, absentDeduction: 0, unpaidLeaveDeduction: 0,
    earlyLeaveDeduction: 0, socialSecurityEnabled: true, taxScheme: 'NORMAL',
    ...overrides,
  }
}

describe('0. Timezone — the October 2569 period is 21 Sep – 20 Oct (Bangkok) on any server TZ', () => {
  it('has no phantom absence on the 21st: an employee who attended every working day has 0 unrecorded absences', () => {
    const days: string[] = []
    for (let d = new Date('2026-09-21T00:00:00Z'); d <= new Date('2026-10-20T00:00:00Z'); d = new Date(d.getTime() + 86_400_000)) {
      days.push(d.toISOString().slice(0, 10))
    }
    const count = countUnrecordedAbsenceDays({
      periodStart: OCT_START,
      periodEnd: OCT_END,
      today: bkk('2026-10-25'),
      attendanceDateKeys: new Set(days),
      leaveDateKeys: noLeave,
      holidays: [],
      branchId: null,
      employeeStartDate: null,
    })
    expect(count).toBe(0)
  })

  it('a missing day inside the period (Tue 22 Sep) is exactly 1 absence, and the 21st itself is counted only when missing', () => {
    const base = {
      periodStart: OCT_START, periodEnd: OCT_END, today: bkk('2026-10-25'),
      leaveDateKeys: noLeave, holidays: [], branchId: null, employeeStartDate: null,
    }
    const all = new Set<string>()
    for (let d = new Date('2026-09-21T00:00:00Z'); d <= new Date('2026-10-20T00:00:00Z'); d = new Date(d.getTime() + 86_400_000)) {
      all.add(d.toISOString().slice(0, 10))
    }
    const without22 = new Set([...all].filter((k) => k !== '2026-09-22'))
    const without21 = new Set([...all].filter((k) => k !== '2026-09-21'))
    expect(countUnrecordedAbsenceDays({ ...base, attendanceDateKeys: without22 })).toBe(1)
    expect(countUnrecordedAbsenceDays({ ...base, attendanceDateKeys: without21 })).toBe(1) // Mon 21 Sep is a working day
  })

  it('lastWorkingDate caps unrecorded absences (nothing counted after the last working day)', () => {
    const count = countUnrecordedAbsenceDays({
      periodStart: OCT_START, periodEnd: OCT_END, today: bkk('2026-10-25'),
      attendanceDateKeys: new Set(), leaveDateKeys: noLeave, holidays: [], branchId: null,
      employeeStartDate: null, employeeLastWorkingDate: new Date('2026-09-22'),
    })
    expect(count).toBe(2) // Mon 21 + Tue 22 Sep only
  })
})

describe('1. Social security — 5%, wage base 1,650–17,500, whole-baht rounding, on the paid amount', () => {
  it.each([
    [12_345, 617], // 617.25 → 617
    [800, 83], // below the 1,650 floor → 82.50 → 83
    [8_750, 438], // 437.50 → 438
    [35_000, 875], // above the 17,500 ceiling
    [0, 0], // no wage at all → nothing
  ])('wage %d → %d', (wage, ss) => {
    expect(computeSocialSecurity(wage)).toBe(ss)
  })

  it('uses the prorated paid amount, not the full monthly salary (new hire paid 8,750 of 17,500 → 438)', () => {
    const t = computePayrollTotals(totalsInput({ baseSalary: 8_750 }))
    expect(t.socialSecurity).toBe(438)
  })

  it('commission still never enters the SS base', () => {
    expect(computePayrollTotals(totalsInput({ baseSalary: 12_345, commission: 50_000 })).socialSecurity).toBe(617)
  })
})

describe('2. ภงด.1 per-employee monthly override', () => {
  it('replaces the formula amount for NORMAL, and keeps the formula amount in taxDetail for comparison', () => {
    const formula = computeMonthlyTax(35_000, 875).monthlyWithholding
    const t = computePayrollTotals(totalsInput({ baseSalary: 35_000, monthlyTaxOverride: 1_000 }))
    expect(formula).toBe(414.58)
    expect(t.taxDeduction).toBe(1_000)
    const detail = parseTaxDetail(t.taxDetail)!
    expect(detail.formulaMonthlyWithholding).toBe(414.58)
    expect(detail.monthlyWithholding).toBe(1_000)
    expect(monthlyTaxOverrideFromTaxDetail(t.taxDetail)).toBe(1_000)
    expect(t.netSalary).toBe(35_000 - 875 - 1_000)
  })

  it('no override (null) → formula, exactly as before', () => {
    const t = computePayrollTotals(totalsInput({ baseSalary: 35_000, monthlyTaxOverride: null }))
    expect(t.taxDeduction).toBe(414.58)
    expect(monthlyTaxOverrideFromTaxDetail(t.taxDetail)).toBeNull()
  })

  it('an override of 0 is honoured (employee asked for no withholding)', () => {
    expect(computePayrollTotals(totalsInput({ baseSalary: 35_000, monthlyTaxOverride: 0 })).taxDeduction).toBe(0)
  })

  it('does not affect OFF_SYSTEM_WHT — still 3% (ภงด.3)', () => {
    const t = computePayrollTotals(totalsInput({ baseSalary: 35_000, taxScheme: 'OFF_SYSTEM_WHT', monthlyTaxOverride: 1_000 }))
    expect(t.taxDeduction).toBe(1_050)
    expect(t.socialSecurity).toBe(0)
  })
})

describe('3. Deductions by employee type', () => {
  it('daily wage rate: MONTHLY = full salary ÷ 30, DAILY = the daily rate', () => {
    expect(dailyWageRate({ payType: 'MONTHLY', baseSalary: 30_000, dailyRate: null })).toBe(1_000)
    expect(dailyWageRate({ payType: 'DAILY', baseSalary: null, dailyRate: 400 })).toBe(400)
  })

  it('MONTHLY 30,000: absent 1 day → 1,000.00', () => {
    expect(perDayDeduction(dailyWageRate({ payType: 'MONTHLY', baseSalary: 30_000, dailyRate: null }), 1)).toBe(1_000)
  })

  it('MONTHLY 35,000: absent 2 days → rounded per day then summed (1,166.67 × 2 = 2,333.34)', () => {
    expect(perDayDeduction(35_000 / 30, 2)).toBe(2_333.34)
  })

  const late = (baseSalary: number, minutesPerDay: number[], ratePerMinute?: number) =>
    computeLateDeduction({
      baseSalary,
      ratePerMinute,
      attendances: minutesPerDay.map((m, i) => attendance(`2026-10-0${i + 1}`, { lateMinutes: m })),
      leaveDateKeys: noLeave,
      holidays: [],
      branchId: null,
    }).lateDeduction

  it('MONTHLY 30,000: late 15 minutes → 31.25', () => {
    expect(late(30_000, [15])).toBe(31.25)
  })

  it('MONTHLY 35,000: late 15 minutes → 36.46, late 18 minutes → 43.75', () => {
    expect(late(35_000, [15])).toBe(36.46)
    expect(late(35_000, [18])).toBe(43.75)
  })

  it('late is rounded per day, then summed (35,000: 15 min on two days → 36.46 × 2 = 72.92)', () => {
    expect(late(35_000, [15, 15])).toBe(72.92)
  })

  it('DAILY 400: late 15 minutes → 12.50', () => {
    expect(late(0, [15], perMinuteWageRate(400))).toBe(12.5)
  })

  it('MONTHLY 30,000: early leave 5 minutes → 10.42 (per minute, no more half-day)', () => {
    const r = computeEarlyLeaveDeduction({
      ratePerMinute: perMinuteWageRate(dailyWageRate({ payType: 'MONTHLY', baseSalary: 30_000, dailyRate: null })),
      attendances: [attendance('2026-10-01', { earlyLeaveMinutes: 5 })],
      leaveDateKeys: noLeave,
      holidays: [],
      branchId: null,
    })
    expect(r.earlyLeaveDeduction).toBe(10.42)
    expect(r.earlyLeaveMinutes).toBe(5)
  })

  it('no late/early-leave deduction on an approved-leave day or a holiday', () => {
    const holiday = { id: 'h', holidayName: 'หยุด', holidayDate: new Date('2026-10-02T00:00:00Z'), holidayType: 'PUBLIC_HOLIDAY', repeatEveryYear: false, branchId: null } as any
    const r = computeEarlyLeaveDeduction({
      ratePerMinute: 1,
      attendances: [attendance('2026-10-01', { earlyLeaveMinutes: 30 }), attendance('2026-10-02', { earlyLeaveMinutes: 30 })],
      leaveDateKeys: new Set(['2026-10-01']),
      holidays: [holiday],
      branchId: null,
    })
    expect(r.earlyLeaveDeduction).toBe(0)
  })

  it('unpaid leave crossing two periods counts only the days inside this one', () => {
    const days = leaveDaysWithinPeriod([{ startDate: new Date('2026-10-18'), endDate: new Date('2026-10-24') }], OCT)
    expect(days).toBe(3) // 18–20 Oct
    expect(perDayDeduction(1_000, days)).toBe(3_000)
  })
})

describe('4. Monthly proration (period 21 Sep – 20 Oct)', () => {
  it('new hire: 30,000 starting 6 Oct (15 period days before it) → 15,000.00', () => {
    const r = computeMonthlyProration({ baseSalary: 30_000, period: OCT, startDate: new Date('2026-10-06'), lastWorkingDate: null })
    expect(r).toMatchObject({ amount: 15_000, daysBeforeStart: 15, daysAfterLastWorking: 0, prorated: true })
  })

  it('leaver: 30,000 with last working day 10 Oct (10 period days after it) → 20,000.00', () => {
    const r = computeMonthlyProration({ baseSalary: 30_000, period: OCT, startDate: new Date('2020-01-01'), lastWorkingDate: new Date('2026-10-10') })
    expect(r).toMatchObject({ amount: 20_000, daysBeforeStart: 0, daysAfterLastWorking: 10, prorated: true })
  })

  it('a full-period employee is not prorated', () => {
    expect(computeMonthlyProration({ baseSalary: 30_000, period: OCT, startDate: new Date('2020-01-01'), lastWorkingDate: null }))
      .toMatchObject({ amount: 30_000, prorated: false })
  })

  it('never negative and never above the full salary (31-day period, started on day 2 → 30,000 − 1,000 = 29,000; started after the period → 0)', () => {
    const sep = payrollPeriodKeys(9, 2026) // 21 Aug – 20 Sep = 31 days
    expect(computeMonthlyProration({ baseSalary: 30_000, period: sep, startDate: new Date('2026-08-22'), lastWorkingDate: null }).amount).toBe(29_000)
    expect(computeMonthlyProration({ baseSalary: 30_000, period: OCT, startDate: new Date('2026-11-01'), lastWorkingDate: null }).amount).toBe(0)
  })
})

describe('5. OFF_SYSTEM_WHT 3% is taken on the amount actually paid', () => {
  it('prorated 15,000 → 450', () => {
    expect(computePayrollTotals(totalsInput({ baseSalary: 15_000, taxScheme: 'OFF_SYSTEM_WHT' })).taxDeduction).toBe(450)
  })
})

describe('6. YTD counts APPROVED/SENT only', () => {
  beforeEach(() => vi.mocked(prisma.payroll.findMany).mockClear())

  it('queries only APPROVED/SENT, non-deleted rows of the same year up to the slip month', async () => {
    await computePayrollYtd('user-1', 2026, 7)
    expect(vi.mocked(prisma.payroll.findMany).mock.calls[0][0]).toMatchObject({
      where: { userId: 'user-1', year: 2026, month: { lte: 7 }, deletedAt: null, status: { in: ['APPROVED', 'SENT'] } },
    })
  })
})

describe('รวมรายได้ − รวมรายการหัก = netSalary in every new case', () => {
  function reconcile(input: PayrollTotalsInput & { payType?: string }) {
    const t = computePayrollTotals(input)
    const items = buildPayslipLineItems({
      ...input,
      unpaidLeave: input.unpaidLeaveDeduction,
      taxDeduction: t.taxDeduction,
      taxDetail: t.taxDetail,
      socialSecurity: t.socialSecurity,
      lateDays: 1,
      lateMinutes: 15,
      absentDays: 1,
    })
    expect(t.negativeClampAmount).toBe(0)
    expect(Math.round((items.totalEarnings - items.totalDeductions) * 100) / 100).toBe(t.netSalary)
  }

  it('prorated new hire with absence/late/early leave', () => {
    reconcile(totalsInput({ baseSalary: 15_000, absentDeduction: 1_000, lateDeduction: 31.25, earlyLeaveDeduction: 10.42 }))
  })
  it('leaver with unpaid leave', () => {
    reconcile(totalsInput({ baseSalary: 20_000, unpaidLeaveDeduction: 3_000 }))
  })
  it('DAILY with per-minute late', () => {
    reconcile({ ...totalsInput({ baseSalary: 8_600, lateDeduction: 12.5 }), payType: 'DAILY' })
  })
  it('tax override', () => {
    reconcile(totalsInput({ baseSalary: 35_000, monthlyTaxOverride: 1_000, commission: 5_000 }))
  })
  it('OFF_SYSTEM_WHT on a prorated amount', () => {
    reconcile(totalsInput({ baseSalary: 15_000, taxScheme: 'OFF_SYSTEM_WHT' }))
  })
})
