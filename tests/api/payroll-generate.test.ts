import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => {
  const prisma: any = {
    companySettings: { findUnique: vi.fn().mockResolvedValue({ absentDeductRate: 0 }) },
    companyHoliday:  { findMany: vi.fn().mockResolvedValue([]) },
    user:            { findMany: vi.fn() },
    attendance:      { findMany: vi.fn().mockResolvedValue([]) },
    leaveRequest:    { findMany: vi.fn().mockResolvedValue([]) },
    securityDepositPlan: { findMany: vi.fn().mockResolvedValue([]) },
    payroll:         { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), count: vi.fn().mockResolvedValue(0) },
    $transaction:    vi.fn((cb: any) => cb(prisma)),
  }
  return { prisma }
})

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

vi.mock('@/lib/ensure-payroll-payslip-columns', () => ({
  ensurePayrollPayslipColumns: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/ensure-payroll-fields-batch-2', () => ({
  ensurePayrollFieldsBatch2: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/ensure-payroll-fields-batch-3', () => ({
  ensurePayrollFieldsBatch3: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/ensure-payroll-formulas-round1', () => ({
  ensurePayrollFormulasRound1: vi.fn().mockResolvedValue(undefined),
}))

// Static mock matching the REAL payrollPeriodRange(1, 2025) result — 21 Dec
// 2024 through 20 Jan 2025, not calendar-month Jan 1-31. Every existing test
// in this file requests {month:1, year:2025} and uses attendance/updatedAt
// fixtures already comfortably inside this window (see payroll-period.test.ts
// for the function's own dedicated edge-case tests, incl. this exact
// year-rollover case) — only the one test asserting the literal query
// boundary (below) needed updating for the new dates.
vi.mock('@/lib/payroll-period', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/payroll-period')>()),
  payrollPeriodRange: vi.fn().mockReturnValue({
    start: new Date('2024-12-21T00:00:00.000+07:00'),
    end: new Date('2025-01-20T23:59:59.999+07:00'),
  }),
}))

vi.mock('@/lib/branch-scope', () => ({
  buildBranchScope: vi.fn().mockReturnValue({}),
  branchUserWhere:  vi.fn((_scope: unknown, extra: unknown) => extra ?? {}),
}))

vi.mock('@/lib/api-guard', () => ({
  requireCsrf: vi.fn().mockReturnValue(null),
}))

vi.mock('@/lib/payroll-late-deduction', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/payroll-late-deduction')>()),
  buildApprovedLeaveDateSet:    vi.fn().mockReturnValue(new Set()),
  computeLateDeduction:         vi.fn().mockReturnValue({ lateDeduction: 0, lateDays: 0, billableLateMinutes: 0, lines: [] }),
  serializeLateDeductionDetail: vi.fn().mockReturnValue('[]'),
  roundMoney:                   (n: number) => Math.round(n * 100) / 100,
}))

// Defaults to 0 so every existing test in this file (none of which assert
// absentDays/absentDeduction against this new source) keeps its exact
// pre-existing numbers — only the dedicated describe block below overrides
// this per-test to verify the wiring itself.
vi.mock('@/lib/payroll-unrecorded-absence', () => ({
  countUnrecordedAbsenceDays: vi.fn().mockReturnValue(0),
}))

vi.mock('@/lib/payroll-tax', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/payroll-tax')>()),
  computeMonthlyTax: vi.fn().mockReturnValue({ monthlyWithholding: 0 }),
  computeOffSystemWht: vi.fn().mockReturnValue({ monthlyWithholding: 0 }),
}))

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { computeLateDeduction } from '@/lib/payroll-late-deduction'
import { countUnrecordedAbsenceDays } from '@/lib/payroll-unrecorded-absence'
import { computeMonthlyTax } from '@/lib/payroll-tax'
import { payrollPeriodRange } from '@/lib/payroll-period'
import { POST } from '@/app/api/payroll/generate/route'

// ── Helpers ──────────────────────────────────────────────────────────────────

const hrSession = { user: { id: 'hr-1', name: 'HR', role: 'HR', branchId: null } }

function makeReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/payroll/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const employees = [
  { id: 'emp-1', name: 'พนักงาน หนึ่ง', baseSalary: 30000, socialSecurity: true, branchId: 'b1' },
  { id: 'emp-2', name: 'พนักงาน สอง',   baseSalary: 25000, socialSecurity: true, branchId: 'b1' },
]

describe('POST /api/payroll/generate — does not overwrite APPROVED payroll', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.user.findMany).mockResolvedValue(employees as any)
    vi.mocked(prisma.payroll.upsert).mockResolvedValue({ id: 'payroll-x' } as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({ status: 'DRAFT' } as any)
  })

  it('skips the employee whose payroll is already APPROVED, upserts only the rest', async () => {
    vi.mocked(prisma.payroll.findMany).mockResolvedValue([
      { userId: 'emp-1' }, // emp-1 already APPROVED for this month/year
    ] as any)

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    expect(res.status).toBe(200)
    const data = await res.json()

    expect(data.success).toBe(true)
    expect(data.count).toBe(1) // only emp-2 generated
    expect(data.skippedApproved).toEqual([{ userId: 'emp-1', name: 'พนักงาน หนึ่ง' }])
    expect(data.message).toContain('พนักงาน หนึ่ง')

    // emp-1 must never be touched by upsert
    const upsertCalls = vi.mocked(prisma.payroll.upsert).mock.calls
    expect(upsertCalls).toHaveLength(1)
    expect(upsertCalls[0][0].where).toEqual({ userId_month_year: { userId: 'emp-2', month: 1, year: 2025 } })
  })

  it('generates for everyone and reports no skips when nobody is APPROVED yet', async () => {
    vi.mocked(prisma.payroll.findMany).mockResolvedValue([] as any)

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    expect(res.status).toBe(200)
    const data = await res.json()

    expect(data.count).toBe(2)
    expect(data.skippedApproved).toEqual([])
    expect(data.message).toBeUndefined()
    expect(prisma.payroll.upsert).toHaveBeenCalledTimes(2)
  })

  it('the APPROVED-check query is scoped to the requested month/year and the employees in scope', async () => {
    vi.mocked(prisma.payroll.findMany).mockResolvedValue([] as any)
    await POST(makeReq({ month: 3, year: 2026 }))

    expect(prisma.payroll.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          month: 3,
          year: 2026,
          status: 'APPROVED',
          userId: { in: ['emp-1', 'emp-2'] },
        }),
      }),
    )
  })

  it('skips an employee approved mid-request even though the top-level check missed it (TOCTOU race)', async () => {
    // Nobody is APPROVED yet at the top-level `existingApproved` read...
    vi.mocked(prisma.payroll.findMany).mockResolvedValue([] as any)
    // ...but by the time this employee's transaction re-checks status
    // right before writing, someone else has approved it concurrently.
    vi.mocked(prisma.payroll.findUnique).mockImplementation(({ where }: any) => {
      const status = where.userId_month_year.userId === 'emp-1' ? 'APPROVED' : 'DRAFT'
      return Promise.resolve({ status }) as any
    })

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    expect(res.status).toBe(200)
    const data = await res.json()

    expect(data.count).toBe(1) // only emp-2 actually written
    expect(data.skippedApproved).toEqual([]) // top-level check didn't catch it
    expect(data.message).toContain('พนักงาน หนึ่ง') // but the race-skip did

    const upsertCalls = vi.mocked(prisma.payroll.upsert).mock.calls
    expect(upsertCalls).toHaveLength(1)
    expect(upsertCalls[0][0].where).toEqual({ userId_month_year: { userId: 'emp-2', month: 1, year: 2025 } })
  })

  it('rejects regenerating over a soft-deleted payroll instead of resurrecting it', async () => {
    vi.mocked(prisma.payroll.findMany).mockResolvedValue([] as any)
    // The in-transaction re-check finds emp-1's row soft-deleted.
    vi.mocked(prisma.payroll.findUnique).mockImplementation(({ where }: any) => {
      if (where.userId_month_year.userId === 'emp-1') {
        return Promise.resolve({ status: 'DRAFT', deletedAt: new Date('2026-08-01') }) as any
      }
      return Promise.resolve({ status: 'DRAFT', deletedAt: null }) as any
    })

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    expect(res.status).toBe(200)
    const data = await res.json()

    expect(data.count).toBe(1) // only emp-2 written
    expect(data.deletedSkipped).toEqual(['พนักงาน หนึ่ง'])
    expect(data.deletedWarning).toContain('ต้องกู้คืนก่อนถึงจะคำนวณใหม่ได้')
    expect(data.deletedWarning).toContain('พนักงาน หนึ่ง')

    // emp-1's soft-deleted row must never be touched by upsert.
    const upsertCalls = vi.mocked(prisma.payroll.upsert).mock.calls
    expect(upsertCalls).toHaveLength(1)
    expect(upsertCalls[0][0].where).toEqual({ userId_month_year: { userId: 'emp-2', month: 1, year: 2025 } })
  })
})

// Same instants as the file-level payrollPeriodRange mock (21 Dec 2024 – 20 Jan 2025, Bangkok time)
const PERIOD_START = new Date('2024-12-21T00:00:00.000+07:00')
const PERIOD_END = new Date('2025-01-20T23:59:59.999+07:00')

describe('POST /api/payroll/generate — leavers: lastWorkingDate decides the period (2026-10)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.payroll.upsert).mockResolvedValue({ id: 'payroll-x' } as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({ status: 'DRAFT' } as any)
    vi.mocked(prisma.payroll.findMany).mockResolvedValue([] as any)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([] as any)
    vi.mocked(computeMonthlyTax).mockReturnValue({ monthlyWithholding: 0 } as any)
    vi.mocked(countUnrecordedAbsenceDays).mockReturnValue(0)
  })

  it('selects employees by startDate (not after this period) and lastWorkingDate (not before it) — updatedAt only as a fallback for DISABLED rows with no lastWorkingDate yet', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as any)
    await POST(makeReq({ month: 1, year: 2025 }))

    const call = vi.mocked(prisma.user.findMany).mock.calls[0][0] as any
    expect(call.where.status).toEqual({ in: ['ACTIVE', 'DISABLED'] })
    expect(call.where.AND).toEqual([
      { OR: [{ startDate: null }, { startDate: { lte: PERIOD_END } }] },
      {
        OR: [
          { lastWorkingDate: { gte: PERIOD_START } },
          { lastWorkingDate: null, status: 'ACTIVE' },
          { lastWorkingDate: null, status: 'DISABLED', updatedAt: { gte: PERIOD_START, lte: PERIOD_END } },
        ],
      },
    ])
  })

  it('leaver with lastWorkingDate: 30,000 − 1,000/day × days in the period after the last working day, no warning', async () => {
    // last working day 10 Jan → 11–20 Jan = 10 days not worked → 30,000 − 10 × 1,000 = 20,000
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: 'emp-3', name: 'พนักงาน สาม', baseSalary: 30000, socialSecurity: true, branchId: 'b1',
        status: 'DISABLED', startDate: new Date('2020-01-01'), lastWorkingDate: new Date('2025-01-10'),
      },
    ] as any)

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    expect(res.status).toBe(200)
    const data = await res.json()
    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any

    expect(payload.baseSalary).toBe(20000)
    expect(payload.note).toContain('หลังวันทำงานวันสุดท้าย 10 วัน')
    expect(payload.criticalWarning).toBeNull()
    expect(data.disabledIncluded).toEqual([{ userId: 'emp-3', name: 'พนักงาน สาม' }])
    expect(data.disabledWarning).toBeUndefined()
  })

  it('leaver with lastWorkingDate gets unrecorded absences counted only up to that date', async () => {
    const lastWorkingDate = new Date('2025-01-10')
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: 'emp-3', name: 'พนักงาน สาม', baseSalary: 30000, socialSecurity: true, branchId: 'b1',
        status: 'DISABLED', startDate: new Date('2020-01-01'), lastWorkingDate,
      },
    ] as any)

    await POST(makeReq({ month: 1, year: 2025 }))

    expect(countUnrecordedAbsenceDays).toHaveBeenCalledTimes(1)
    expect(vi.mocked(countUnrecordedAbsenceDays).mock.calls[0][0]).toMatchObject({ employeeLastWorkingDate: lastWorkingDate })
  })

  it('DISABLED without lastWorkingDate: full salary + red row warning + response warning asking HR to fill it in', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: 'emp-3', name: 'พนักงาน สาม', baseSalary: 20000, socialSecurity: true, branchId: 'b1',
        status: 'DISABLED', startDate: new Date('2020-01-01'), updatedAt: new Date('2025-01-20'),
      },
    ] as any)

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    expect(res.status).toBe(200)
    const data = await res.json()

    expect(data.count).toBe(1)
    expect(data.disabledIncluded).toEqual([{ userId: 'emp-3', name: 'พนักงาน สาม' }])
    expect(data.disabledWarning).toContain('ยังไม่ได้กรอกวันทำงานวันสุดท้าย')
    expect(data.disabledWarning).toContain('พนักงาน สาม')

    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any
    expect(payload.baseSalary).toBe(20000) // not prorated — nothing to prorate against yet
    expect(payload.criticalWarning).toContain('ยังไม่ได้กรอกวันทำงานวันสุดท้าย')
    expect(countUnrecordedAbsenceDays).not.toHaveBeenCalled()
  })

  it('does not flag or warn about a normal ACTIVE employee', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-1', name: 'พนักงาน หนึ่ง', baseSalary: 30000, socialSecurity: true, branchId: 'b1', status: 'ACTIVE', startDate: new Date('2020-01-01') },
    ] as any)

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    const data = await res.json()
    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any

    expect(data.disabledIncluded).toEqual([])
    expect(data.disabledWarning).toBeUndefined()
    expect(data.missingStartDateWarning).toBeUndefined()
    expect(payload.criticalWarning).toBeNull()
    expect(payload.note).toBeNull()
  })

  it('MONTHLY employee with no startDate: full salary + red row warning + response warning', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-1', name: 'พนักงาน หนึ่ง', baseSalary: 30000, socialSecurity: true, branchId: 'b1', status: 'ACTIVE' },
    ] as any)

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    const data = await res.json()
    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any

    expect(payload.baseSalary).toBe(30000)
    expect(payload.criticalWarning).toContain('ยังไม่ได้กรอกวันเริ่มงาน')
    expect(data.missingStartDateWarning).toContain('พนักงาน หนึ่ง')
  })
})

describe('POST /api/payroll/generate — wires payrollPeriodRange (21-20) into the attendance/leave queries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as any)
    vi.mocked(prisma.payroll.findMany).mockResolvedValue([] as any)
  })

  it('calls payrollPeriodRange(month, year) — not the calendar-month helper — and passes its start/end straight into every date-scoped query', async () => {
    // Distinct from the file's default static mock value, so a match here
    // proves the route actually used THIS call's return value, not some
    // coincidentally-equal hardcoded range.
    const customStart = new Date('2026-08-21T00:00:00.000+07:00')
    const customEnd = new Date('2026-09-20T23:59:59.999+07:00')
    vi.mocked(payrollPeriodRange).mockReturnValueOnce({ start: customStart, end: customEnd })

    await POST(makeReq({ month: 9, year: 2026 }))

    expect(payrollPeriodRange).toHaveBeenCalledWith(9, 2026)

    const userCall = vi.mocked(prisma.user.findMany).mock.calls[0][0] as any
    expect(userCall.where.AND[0]).toEqual({ OR: [{ startDate: null }, { startDate: { lte: customEnd } }] })
    expect(userCall.where.AND[1].OR[0]).toEqual({ lastWorkingDate: { gte: customStart } })

    const attendanceCall = vi.mocked(prisma.attendance.findMany).mock.calls[0][0] as any
    expect(attendanceCall.where.date).toEqual({ gte: customStart, lte: customEnd })

    const leaveCalls = vi.mocked(prisma.leaveRequest.findMany).mock.calls
    for (const [call] of leaveCalls) {
      expect((call as any).where.startDate).toEqual({ lte: customEnd })
      expect((call as any).where.endDate).toEqual({ gte: customStart })
    }
  })
})

describe('POST /api/payroll/generate — DAILY pay type', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.payroll.findMany).mockResolvedValue([] as any)
    vi.mocked(prisma.payroll.upsert).mockResolvedValue({ id: 'payroll-x' } as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({ status: 'DRAFT' } as any)
    vi.mocked(computeMonthlyTax).mockReturnValue({ monthlyWithholding: 0 } as any)
  })

  const dailyEmployee = {
    id: 'emp-d1', name: 'พนักงาน รายวัน', baseSalary: null, dailyRate: 300,
    payType: 'DAILY', socialSecurity: true, branchId: 'b1',
  }

  function attRow(date: string, status: string, extra: Record<string, unknown> = {}) {
    return {
      userId: 'emp-d1', date: new Date(date), lateMinutes: 0, status,
      earlyLeaveMinutes: 0, workMinutes: 0, leaveType: null,
      checkIn: new Date(`${date}T08:00:00Z`),
      ...extra,
    }
  }

  it('pays daysWorked × dailyRate — full days for NORMAL/LATE/EARLY_LEAVE/OT, half for HALF_DAY, zero for LEAVE/ABSENT', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([dailyEmployee] as any)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([
      attRow('2025-01-05', 'NORMAL'),
      attRow('2025-01-06', 'LATE', { lateMinutes: 30 }),
      attRow('2025-01-07', 'HALF_DAY'),
      attRow('2025-01-08', 'ABSENT', { checkIn: null }),
      attRow('2025-01-09', 'LEAVE', { checkIn: null }),
      attRow('2025-01-10', 'EARLY_LEAVE', { earlyLeaveMinutes: 15 }),
    ] as any)
    vi.mocked(computeMonthlyTax).mockReturnValue({ monthlyWithholding: 20 } as any)

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    expect(res.status).toBe(200)

    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any
    // 1 (NORMAL) + 1 (LATE) + 0.5 (HALF_DAY) + 0 (ABSENT) + 0 (LEAVE) + 1 (EARLY_LEAVE) = 3.5
    expect(payload.daysWorked).toBe(3.5)
    expect(payload.dailyRateUsed).toBe(300)
    expect(payload.payType).toBe('DAILY')
    expect(payload.baseSalary).toBe(1050) // 3.5 × 300
    expect(payload.socialSecurity).toBe(83) // wage 1,050 is below the 1,650 floor → 83
    expect(payload.taxDeduction).toBe(20)
    // early leave 15 min × (300 ÷ 8 ÷ 60 = 0.625/min) = 9.375 → 9.38 (late is mocked to 0 in this file)
    expect(payload.earlyLeaveDeduction).toBe(9.38)
    expect(payload.netSalary).toBe(937.62) // 1050 − 83 − 20 − 9.38
  })

  it('docks no absent/unpaid leave (unpaid days simply aren\'t paid), but does dock late per minute at dailyRate ÷ 8 ÷ 60 (2026-10)', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([dailyEmployee] as any)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([
      attRow('2025-01-05', 'NORMAL'),
      attRow('2025-01-06', 'LATE', { lateMinutes: 999 }), // would be a big deduction for MONTHLY
      attRow('2025-01-07', 'ABSENT', { checkIn: null }),
    ] as any)
    vi.mocked(prisma.leaveRequest.findMany).mockImplementation(({ where }: any) =>
      Promise.resolve(where.type === 'UNPAID'
        ? [{ userId: 'emp-d1', days: 5, startDate: new Date('2025-01-10'), endDate: new Date('2025-01-14') }]
        : []) as any,
    )
    vi.mocked(computeLateDeduction).mockReturnValueOnce({ lateDeduction: 624.38, lateDays: 1, billableLateMinutes: 999, lines: [] } as any)

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    expect(res.status).toBe(200)
    vi.mocked(prisma.leaveRequest.findMany).mockResolvedValue([] as any)

    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any
    expect(payload.absentDeduction).toBe(0)
    expect(payload.unpaidLeave).toBe(0)
    expect(payload.absentDays).toBe(0)
    // late goes through the same per-day computeLateDeduction as MONTHLY, but
    // at this employee's own per-minute rate: 300 ÷ 8 ÷ 60 = 0.625
    expect(computeLateDeduction).toHaveBeenCalledWith(expect.objectContaining({ ratePerMinute: 0.625 }))
    expect(payload.lateDeduction).toBe(624.38)
    expect(payload.lateDays).toBe(1)
  })

  it('computes SS/tax off daysWorked × dailyRate, not off baseSalary (which is null for a DAILY-only employee)', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([dailyEmployee] as any)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([attRow('2025-01-05', 'NORMAL')] as any)

    await POST(makeReq({ month: 1, year: 2025 }))

    expect(computeMonthlyTax).toHaveBeenCalledWith(300, 83) // 1 day × 300 dailyRate, SS = 83 (1,650 floor)
  })

  it('skips SS deduction when the employee has social security disabled, same as MONTHLY', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { ...dailyEmployee, socialSecurity: false },
    ] as any)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([attRow('2025-01-05', 'NORMAL')] as any)

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any
    expect(res.status).toBe(200)
    expect(payload.socialSecurity).toBe(0)
  })

  it('handles zero attendance (no days worked) without crashing — netSalary 0', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([dailyEmployee] as any)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([] as any)

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    expect(res.status).toBe(200)
    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any
    expect(payload.daysWorked).toBe(0)
    expect(payload.baseSalary).toBe(0)
    expect(payload.socialSecurity).toBe(0)
    expect(payload.netSalary).toBe(0)
  })
})

describe('POST /api/payroll/generate — MONTHLY unaffected by the payType field existing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.payroll.findMany).mockResolvedValue([] as any)
    vi.mocked(prisma.payroll.upsert).mockResolvedValue({ id: 'payroll-x' } as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({ status: 'DRAFT' } as any)
    vi.mocked(computeMonthlyTax).mockReturnValue({ monthlyWithholding: 0 } as any)
  })

  it('produces the exact same numbers whether payType is explicit "MONTHLY" or the field is absent entirely (legacy-shaped fixture)', async () => {
    const attendance = [
      { userId: 'emp-1', date: new Date('2025-01-06'), lateMinutes: 0, status: 'ABSENT', earlyLeaveMinutes: 0, workMinutes: 0, leaveType: null, checkIn: null },
    ]
    vi.mocked(prisma.attendance.findMany).mockResolvedValue(attendance as any)

    // Run 1: payType explicitly 'MONTHLY'
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-1', name: 'พนักงาน หนึ่ง', baseSalary: 26000, payType: 'MONTHLY', socialSecurity: true, branchId: 'b1' },
    ] as any)
    const res1 = await POST(makeReq({ month: 1, year: 2025 }))
    const payload1 = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any

    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.payroll.findMany).mockResolvedValue([] as any)
    vi.mocked(prisma.payroll.upsert).mockResolvedValue({ id: 'payroll-x' } as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({ status: 'DRAFT' } as any)
    vi.mocked(computeMonthlyTax).mockReturnValue({ monthlyWithholding: 0 } as any)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue(attendance as any)

    // Run 2: no payType field at all (matches every other existing test's fixture shape)
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-1', name: 'พนักงาน หนึ่ง', baseSalary: 26000, socialSecurity: true, branchId: 'b1' },
    ] as any)
    const res2 = await POST(makeReq({ month: 1, year: 2025 }))
    const payload2 = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any

    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
    expect(payload1.absentDeduction).toBeGreaterThan(0) // 26000/26 × 1 ABSENT day
    expect(payload1).toEqual(payload2)
  })

  it('snapshots payType "MONTHLY" and null daysWorked/dailyRateUsed', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-1', name: 'พนักงาน หนึ่ง', baseSalary: 26000, payType: 'MONTHLY', socialSecurity: true, branchId: 'b1' },
    ] as any)

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    expect(res.status).toBe(200)
    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any
    expect(payload.payType).toBe('MONTHLY')
    expect(payload.daysWorked).toBeNull()
    expect(payload.dailyRateUsed).toBeNull()
  })

  it('still calls computeLateDeduction with baseSalary for a MONTHLY employee (unchanged code path)', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-1', name: 'พนักงาน หนึ่ง', baseSalary: 26000, payType: 'MONTHLY', socialSecurity: true, branchId: 'b1' },
    ] as any)

    await POST(makeReq({ month: 1, year: 2025 }))

    expect(computeLateDeduction).toHaveBeenCalledWith(
      expect.objectContaining({ baseSalary: 26000 }),
    )
    expect(computeMonthlyTax).toHaveBeenCalledWith(26000, 750) // 2025 ceiling 15,000 → SS = min(26000×0.05, 750) = 750 (capped)
  })
})

describe('POST /api/payroll/generate — SS ceiling raised 750 → 875 (effective 2026-01-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.payroll.findMany).mockResolvedValue([] as any)
    vi.mocked(prisma.payroll.upsert).mockResolvedValue({ id: 'payroll-x' } as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({ status: 'DRAFT' } as any)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([] as any)
    vi.mocked(computeMonthlyTax).mockReturnValue({ monthlyWithholding: 0 } as any)
  })

  it('caps SS at the new 875 ceiling for a salary that would have hit the old 750 cap', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-1', name: 'พนักงาน สอง หมื่น', baseSalary: 20000, payType: 'MONTHLY', socialSecurity: true, branchId: 'b1' },
    ] as any)

    const res = await POST(makeReq({ month: 1, year: 2026 }))
    expect(res.status).toBe(200)
    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any

    // min(20000 × 5%, 875) = min(1000, 875) = 875 — was 750 before the ceiling raise
    expect(payload.socialSecurity).toBe(875)
    expect(computeMonthlyTax).toHaveBeenCalledWith(20000, 875)
  })

  it('leaves SS unchanged for a salary below the cap either way', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-2', name: 'พนักงาน หมื่น', baseSalary: 10000, payType: 'MONTHLY', socialSecurity: true, branchId: 'b1' },
    ] as any)

    const res = await POST(makeReq({ month: 1, year: 2026 }))
    expect(res.status).toBe(200)
    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any

    // min(10000 × 5%, 875) = min(500, 875) = 500 — below either cap, unaffected by the raise
    expect(payload.socialSecurity).toBe(500)
    expect(computeMonthlyTax).toHaveBeenCalledWith(10000, 500)
  })

  it('applies the same raised ceiling to a DAILY employee whose period earnings exceed it', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-3', name: 'พนักงาน รายวัน สูง', baseSalary: null, dailyRate: 6000, payType: 'DAILY', socialSecurity: true, branchId: 'b1' },
    ] as any)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([
      { userId: 'emp-3', date: new Date('2025-01-05'), lateMinutes: 0, status: 'NORMAL', earlyLeaveMinutes: 0, workMinutes: 0, leaveType: null, checkIn: new Date('2025-01-05T08:00:00Z') },
      { userId: 'emp-3', date: new Date('2025-01-06'), lateMinutes: 0, status: 'NORMAL', earlyLeaveMinutes: 0, workMinutes: 0, leaveType: null, checkIn: new Date('2025-01-06T08:00:00Z') },
      { userId: 'emp-3', date: new Date('2025-01-07'), lateMinutes: 0, status: 'NORMAL', earlyLeaveMinutes: 0, workMinutes: 0, leaveType: null, checkIn: new Date('2025-01-07T08:00:00Z') },
    ] as any)

    const res = await POST(makeReq({ month: 1, year: 2026 }))
    expect(res.status).toBe(200)
    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any

    // periodEarnings = 3 × 6000 = 18000 → min(18000 × 5%, 875) = min(900, 875) = 875 (hits the new cap)
    expect(payload.baseSalary).toBe(18000)
    expect(payload.socialSecurity).toBe(875)
  })

  it('a 2025 (พ.ศ. 2568) payroll still uses the 2025 ceiling of 15,000 → 750', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-1', name: 'พนักงาน สอง หมื่น', baseSalary: 20000, payType: 'MONTHLY', socialSecurity: true, startDate: new Date('2020-01-01'), branchId: 'b1' },
    ] as any)

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    expect(res.status).toBe(200)
    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any
    expect(payload.socialSecurity).toBe(750)
    expect(payload.criticalWarning).toBeNull()
  })
})

describe('POST /api/payroll/generate — taxScheme snapshot + OT/bonus preserved-manual-field pattern (2026-09)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.payroll.findMany).mockResolvedValue([] as any)
    vi.mocked(prisma.payroll.upsert).mockResolvedValue({ id: 'payroll-x' } as any)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([] as any)
    vi.mocked(computeMonthlyTax).mockReturnValue({ monthlyWithholding: 0 } as any)
  })

  it('snapshots User.taxScheme onto the payroll payload, same treatment as payType', async () => {
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({ status: 'DRAFT' } as any)
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-1', name: 'พนักงาน หนึ่ง', baseSalary: 26000, payType: 'MONTHLY', taxScheme: 'OFF_SYSTEM_WHT', socialSecurity: true, branchId: 'b1' },
    ] as any)

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    expect(res.status).toBe(200)
    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any
    expect(payload.taxScheme).toBe('OFF_SYSTEM_WHT')
  })

  it('defaults taxScheme to undefined→NORMAL behavior when the user fixture omits it entirely (legacy-shaped fixture)', async () => {
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({ status: 'DRAFT' } as any)
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-1', name: 'พนักงาน หนึ่ง', baseSalary: 26000, payType: 'MONTHLY', socialSecurity: true, branchId: 'b1' },
    ] as any)

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    expect(res.status).toBe(200)
    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any
    expect(payload.taxScheme).toBeUndefined()
    expect(payload.socialSecurity).toBeGreaterThan(0) // NORMAL behavior — SS still computed, not forced to 0
  })

  it('regenerate preserves the DRAFT row\'s existing overtimePay/bonus — never overwrites them with 0', async () => {
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({
      status: 'DRAFT', backPay: 0, commission: 0, professionalFee: 0, professionalFeeTax: 0,
      overtimePay: 3000, bonus: 8000,
    } as any)
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-1', name: 'พนักงาน หนึ่ง', baseSalary: 26000, payType: 'MONTHLY', taxScheme: 'NORMAL', socialSecurity: true, branchId: 'b1' },
    ] as any)

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    expect(res.status).toBe(200)
    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any

    // The payload itself must never carry these keys — so `update` can't clobber them
    expect(payload).not.toHaveProperty('overtimePay')
    expect(payload).not.toHaveProperty('bonus')
    // ...but they must still have been folded into this month's tax/net calc
    expect(computeMonthlyTax).toHaveBeenCalledWith(26000 + 3000 + 8000, expect.any(Number))
  })

  it('a brand-new employee (no existing DRAFT row) starts overtimePay/bonus at 0 for this calc, and the payload still omits the keys (schema @default(0) applies on create)', async () => {
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue(null as any)
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-1', name: 'พนักงาน หนึ่ง', baseSalary: 26000, payType: 'MONTHLY', taxScheme: 'NORMAL', socialSecurity: true, branchId: 'b1' },
    ] as any)

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    expect(res.status).toBe(200)
    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any

    expect(payload).not.toHaveProperty('overtimePay')
    expect(payload).not.toHaveProperty('bonus')
    expect(computeMonthlyTax).toHaveBeenCalledWith(26000, expect.any(Number))
  })
})

describe('POST /api/payroll/generate — unrecorded-absence days (no data + no approved leave) wired into absentDays', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.payroll.upsert).mockResolvedValue({ id: 'payroll-x' } as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({ status: 'DRAFT' } as any)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([] as any)
    vi.mocked(computeMonthlyTax).mockReturnValue({ monthlyWithholding: 0 } as any)
    // vi.clearAllMocks() clears call history but does NOT reset a mock's
    // return-value implementation back to the module-mock-factory default —
    // an earlier test's mockReturnValue(n) would otherwise leak into later
    // tests in this block, so every test gets an explicit, deliberate value.
    vi.mocked(countUnrecordedAbsenceDays).mockReturnValue(0)
  })

  it('adds countUnrecordedAbsenceDays()\'s result on top of explicit ABSENT-status rows (not replacing them) for an ACTIVE MONTHLY employee', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-1', name: 'พนักงาน หนึ่ง', baseSalary: 30000, payType: 'MONTHLY', status: 'ACTIVE', socialSecurity: true, branchId: 'b1' },
    ] as any)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([
      { userId: 'emp-1', date: new Date('2025-01-06'), lateMinutes: 0, status: 'ABSENT', earlyLeaveMinutes: 0, workMinutes: 0, leaveType: null, checkIn: null },
    ] as any)
    vi.mocked(countUnrecordedAbsenceDays).mockReturnValue(2)

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    expect(res.status).toBe(200)
    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any

    expect(payload.absentDays).toBe(3) // 1 explicit ABSENT row + 2 unrecorded
  })

  it('calls countUnrecordedAbsenceDays() with the SAME periodStart/periodEnd payrollPeriodRange() produced — never a separately-derived calendar-month range', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-1', name: 'พนักงาน หนึ่ง', baseSalary: 30000, payType: 'MONTHLY', status: 'ACTIVE', socialSecurity: true, branchId: 'b1' },
    ] as any)

    await POST(makeReq({ month: 1, year: 2025 }))

    const period = vi.mocked(payrollPeriodRange).mock.results[0].value
    expect(countUnrecordedAbsenceDays).toHaveBeenCalledWith(
      expect.objectContaining({ periodStart: period.start, periodEnd: period.end }),
    )
  })

  it('never calls countUnrecordedAbsenceDays() for a DAILY employee', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-d1', name: 'พนักงาน รายวัน', baseSalary: null, dailyRate: 300, payType: 'DAILY', status: 'ACTIVE', socialSecurity: true, branchId: 'b1' },
    ] as any)

    await POST(makeReq({ month: 1, year: 2025 }))

    expect(countUnrecordedAbsenceDays).not.toHaveBeenCalled()
  })

  it('never calls countUnrecordedAbsenceDays() for a DISABLED employee — no reliable last-working-day signal, existing manual-review warning path covers them instead', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-1', name: 'พนักงาน หนึ่ง', baseSalary: 30000, payType: 'MONTHLY', status: 'DISABLED', updatedAt: new Date('2025-01-15'), socialSecurity: true, branchId: 'b1' },
    ] as any)

    await POST(makeReq({ month: 1, year: 2025 }))

    expect(countUnrecordedAbsenceDays).not.toHaveBeenCalled()
  })

  it('passes the employee\'s own startDate/branchId through untouched', async () => {
    const empStartDate = new Date('2025-01-10')
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-1', name: 'พนักงาน หนึ่ง', baseSalary: 30000, payType: 'MONTHLY', status: 'ACTIVE', startDate: empStartDate, socialSecurity: true, branchId: 'b7' },
    ] as any)

    await POST(makeReq({ month: 1, year: 2025 }))

    expect(countUnrecordedAbsenceDays).toHaveBeenCalledWith(
      expect.objectContaining({ employeeStartDate: empStartDate, branchId: 'b7' }),
    )
  })

  it('feeds the combined absentDays into computeDiligenceAllowance (cuts the allowance) even though every attendance row is otherwise NORMAL', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-1', name: 'พนักงาน หนึ่ง', baseSalary: 30000, payType: 'MONTHLY', status: 'ACTIVE', diligenceAllowanceDefault: 500, socialSecurity: true, branchId: 'b1' },
    ] as any)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([
      { userId: 'emp-1', date: new Date('2025-01-06'), lateMinutes: 0, status: 'NORMAL', earlyLeaveMinutes: 0, workMinutes: 480, leaveType: null, checkIn: new Date('2025-01-06T08:00:00Z') },
    ] as any)
    vi.mocked(countUnrecordedAbsenceDays).mockReturnValue(1)

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    expect(res.status).toBe(200)
    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any

    expect(payload.absentDays).toBe(1)
    expect(payload.diligenceAllowance).toBe(0) // cut, because absentDays > 0
  })

  it('regression: with countUnrecordedAbsenceDays() mocked to 0 (this file\'s default), a fully-attended ACTIVE employee\'s numbers are identical to before this feature existed', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-1', name: 'พนักงาน หนึ่ง', baseSalary: 30000, payType: 'MONTHLY', status: 'ACTIVE', socialSecurity: true, branchId: 'b1' },
    ] as any)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([
      { userId: 'emp-1', date: new Date('2025-01-06'), lateMinutes: 0, status: 'NORMAL', earlyLeaveMinutes: 0, workMinutes: 480, leaveType: null, checkIn: new Date('2025-01-06T08:00:00Z') },
    ] as any)

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    expect(res.status).toBe(200)
    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any

    expect(payload.absentDays).toBe(0)
    expect(payload.absentDeduction).toBe(0)
  })
})

describe('POST /api/payroll/generate — prorate (2026-10 formulas) + netSalary clamp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.payroll.upsert).mockResolvedValue({ id: 'payroll-x' } as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({ status: 'DRAFT' } as any)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([] as any)
    vi.mocked(computeMonthlyTax).mockReturnValue({ monthlyWithholding: 0 } as any)
    vi.mocked(countUnrecordedAbsenceDays).mockReturnValue(0)
    vi.mocked(prisma.leaveRequest.findMany).mockResolvedValue([] as any)
    vi.mocked(prisma.companySettings.findUnique).mockResolvedValue({ absentDeductRate: 0 } as any)
  })

  const FULL_PERIOD_START = new Date('2020-01-01')

  it('new hire mid-period: 30,000 starting 5 Jan (15 period days before it) → 30,000 − 1,000 × 15 = 15,000, and SS/tax use that paid amount', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: 'emp-1', name: 'พนักงาน หนึ่ง', baseSalary: 30000, payType: 'MONTHLY', status: 'ACTIVE',
        startDate: new Date('2025-01-05'), socialSecurity: true, branchId: 'b1',
      },
    ] as any)

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    expect(res.status).toBe(200)
    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any

    expect(payload.baseSalary).toBe(15000)
    expect(payload.note).toContain('ก่อนวันเริ่มงาน 15 วัน')
    expect(payload.socialSecurity).toBe(750) // 5% of the 15,000 actually paid, not of 30,000
    expect(computeMonthlyTax).toHaveBeenCalledWith(15000, 750)
    expect(payload.netSalary).toBe(14250)
    expect(payload.criticalWarning).toBeNull()
  })

  it('absences are docked at the FULL salary ÷ 30 per day even when the period is prorated (no more ÷ 26, no more prorated base)', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: 'emp-1', name: 'พนักงาน หนึ่ง', baseSalary: 30000, payType: 'MONTHLY', status: 'ACTIVE',
        startDate: new Date('2025-01-05'), socialSecurity: true, branchId: 'b1',
      },
    ] as any)
    vi.mocked(countUnrecordedAbsenceDays).mockReturnValue(2)

    await POST(makeReq({ month: 1, year: 2025 }))
    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any

    expect(payload.absentDeduction).toBe(2000) // 2 × 30,000 ÷ 30
    expect(payload.netSalary).toBe(12250) // 15,000 − 2,000 − 750 SS
  })

  it('full-period employee: absent day = salary ÷ 30, rounded per day (26,000 → 866.67)', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-1', name: 'พนักงาน หนึ่ง', baseSalary: 26000, payType: 'MONTHLY', status: 'ACTIVE', startDate: FULL_PERIOD_START, socialSecurity: true, branchId: 'b1' },
    ] as any)
    vi.mocked(countUnrecordedAbsenceDays).mockReturnValue(1)

    await POST(makeReq({ month: 1, year: 2025 }))
    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any

    expect(payload.baseSalary).toBe(26000)
    expect(payload.absentDeduction).toBe(866.67)
  })

  it('no longer adds CompanySettings.absentDeductRate on top of an absent day', async () => {
    vi.mocked(prisma.companySettings.findUnique).mockResolvedValue({ absentDeductRate: 500 } as any)
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-1', name: 'พนักงาน หนึ่ง', baseSalary: 30000, payType: 'MONTHLY', status: 'ACTIVE', startDate: FULL_PERIOD_START, socialSecurity: true, branchId: 'b1' },
    ] as any)
    vi.mocked(countUnrecordedAbsenceDays).mockReturnValue(1)

    await POST(makeReq({ month: 1, year: 2025 }))
    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any

    expect(payload.absentDeduction).toBe(1000)
  })

  it('unpaid leave crossing two periods is docked only for its days inside this period', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-1', name: 'พนักงาน หนึ่ง', baseSalary: 30000, payType: 'MONTHLY', status: 'ACTIVE', startDate: FULL_PERIOD_START, socialSecurity: true, branchId: 'b1' },
    ] as any)
    // 18 Jan – 24 Jan = 7 days on the request, but only 18–20 Jan (3 days) fall in this period
    vi.mocked(prisma.leaveRequest.findMany).mockImplementation(({ where }: any) =>
      Promise.resolve(where.type === 'UNPAID'
        ? [{ userId: 'emp-1', days: 7, startDate: new Date('2025-01-18'), endDate: new Date('2025-01-24') }]
        : []) as any,
    )

    await POST(makeReq({ month: 1, year: 2025 }))
    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any

    expect(payload.unpaidLeave).toBe(3000)
  })

  it('early leave is docked per actual minute (salary ÷ 30 ÷ 8 ÷ 60), not half a day: 30,000 × 5 minutes → 10.42', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-1', name: 'พนักงาน หนึ่ง', baseSalary: 30000, payType: 'MONTHLY', status: 'ACTIVE', startDate: FULL_PERIOD_START, socialSecurity: true, branchId: 'b1' },
    ] as any)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([
      { userId: 'emp-1', date: new Date('2025-01-06'), lateMinutes: 0, status: 'EARLY_LEAVE', earlyLeaveMinutes: 5, workMinutes: 0, leaveType: null, checkIn: new Date('2025-01-06T01:30:00Z') },
    ] as any)

    await POST(makeReq({ month: 1, year: 2025 }))
    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any

    expect(payload.earlyLeaveDeduction).toBe(10.42)
  })

  it('clamps netSalary at 0 and writes the review-me text to criticalWarning — note stays null', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-1', name: 'พนักงาน หนึ่ง', baseSalary: 30000, payType: 'MONTHLY', status: 'ACTIVE', startDate: FULL_PERIOD_START, socialSecurity: true, branchId: 'b1' },
    ] as any)
    // 30 absent days × 1,000 = 30,000 alone, plus SS 750 (2025 ceiling 15,000) → 750 over
    vi.mocked(countUnrecordedAbsenceDays).mockReturnValue(30)

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    expect(res.status).toBe(200)
    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any
    const data = await res.json()

    expect(payload.netSalary).toBe(0)
    expect(payload.criticalWarning).toContain('หักเกินเงินเดือนที่พึงได้รับในงวดนี้')
    expect(payload.criticalWarning).toContain('750')
    expect(payload.note).toBeNull()
    expect(data.negativeNetSalaryWarning).toContain('พนักงาน หนึ่ง')
    expect(data.negativeNetSalaryWarning).toContain('750')
  })

  it('does not report a negativeNetSalaryWarning at all when nobody was clamped', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-1', name: 'พนักงาน หนึ่ง', baseSalary: 26000, payType: 'MONTHLY', status: 'ACTIVE', startDate: FULL_PERIOD_START, socialSecurity: true, branchId: 'b1' },
    ] as any)

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    const data = await res.json()

    expect(data.negativeNetSalaryWarning).toBeUndefined()
  })

  it('a DAILY employee whose deductions somehow exceed periodEarnings is also clamped, with criticalWarning (shared computePayrollTotals path)', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: 'emp-d1', name: 'พนักงาน รายวัน', baseSalary: null, dailyRate: 300,
        payType: 'DAILY', status: 'ACTIVE', socialSecurity: true, branchId: 'b1',
      },
    ] as any)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([
      { userId: 'emp-d1', date: new Date('2025-01-05'), lateMinutes: 0, status: 'NORMAL', earlyLeaveMinutes: 0, workMinutes: 0, leaveType: null, checkIn: new Date('2025-01-05T08:00:00Z') },
    ] as any)
    vi.mocked(computeMonthlyTax).mockReturnValue({ monthlyWithholding: 400 } as any)

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    expect(res.status).toBe(200)
    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any
    const data = await res.json()

    // periodEarnings = 300; SS = 83 (1,650 floor); 300 − 83 − 400 = −183 → clamped
    expect(payload.netSalary).toBe(0)
    expect(payload.criticalWarning).toContain('หักเกินเงินเดือนที่พึงได้รับในงวดนี้')
    expect(data.negativeNetSalaryWarning).toContain('พนักงาน รายวัน')
  })

  it('regenerating with nothing to warn about explicitly clears criticalWarning and note (writes null, never omits the key)', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-1', name: 'พนักงาน หนึ่ง', baseSalary: 26000, payType: 'MONTHLY', status: 'ACTIVE', startDate: FULL_PERIOD_START, socialSecurity: true, branchId: 'b1' },
    ] as any)

    await POST(makeReq({ month: 1, year: 2025 }))
    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any

    expect('criticalWarning' in payload).toBe(true)
    expect(payload.criticalWarning).toBeNull()
    expect('note' in payload).toBe(true)
    expect(payload.note).toBeNull()
  })

  it('BOTH a proration note AND a clamp warning at once are each still their own distinct field, never concatenated together', async () => {
    // Hired 19 Jan → 29 period days before → 26,000 − 866.67/day × 29 = 866.67;
    // 1 absent day (866.67) + SS 83 (1,650 floor) → 83 over → clamped
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: 'emp-1', name: 'พนักงาน หนึ่ง', baseSalary: 26000, payType: 'MONTHLY', status: 'ACTIVE',
        startDate: new Date('2025-01-19'), socialSecurity: true, branchId: 'b1',
      },
    ] as any)
    vi.mocked(countUnrecordedAbsenceDays).mockReturnValue(1)

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any
    const data = await res.json()

    expect(payload.baseSalary).toBe(866.67)
    expect(payload.socialSecurity).toBe(83)
    expect(payload.netSalary).toBe(0)
    expect(payload.note).toContain('Prorated')
    expect(payload.note).not.toContain('หักเกินเงินเดือนที่พึงได้รับ')
    expect(payload.criticalWarning).toContain('หักเกินเงินเดือนที่พึงได้รับในงวดนี้')
    expect(payload.criticalWarning).not.toContain('Prorated')
    expect(data.negativeNetSalaryWarning).toContain('พนักงาน หนึ่ง')
  })
})

describe('POST /api/payroll/generate — review-me warnings (2026-10, never block generate)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.payroll.upsert).mockResolvedValue({ id: 'payroll-x' } as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({ status: 'DRAFT' } as any)
    vi.mocked(prisma.payroll.findMany).mockResolvedValue([] as any)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([] as any)
    vi.mocked(prisma.securityDepositPlan.findMany).mockResolvedValue([] as any)
    vi.mocked(computeMonthlyTax).mockReturnValue({ monthlyWithholding: 0 } as any)
    vi.mocked(countUnrecordedAbsenceDays).mockReturnValue(0)
  })

  const employee = { id: 'emp-1', name: 'พนักงาน หนึ่ง', baseSalary: 30000, payType: 'MONTHLY', status: 'ACTIVE', startDate: new Date('2020-01-01'), socialSecurity: true, branchId: 'b1' }

  it('warns (row + response) when last month is still DRAFT for someone with a security-deposit plan — installment number may repeat', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([employee] as any)
    vi.mocked(prisma.securityDepositPlan.findMany).mockResolvedValue([
      { userId: 'emp-1', totalAmount: 5000, totalInstallments: 6, status: 'ACTIVE' },
    ] as any)
    vi.mocked(prisma.payroll.findMany).mockImplementation(({ where }: any) =>
      Promise.resolve(where.status === 'DRAFT' ? [{ userId: 'emp-1' }] : []) as any,
    )

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    expect(res.status).toBe(200)
    const data = await res.json()
    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any

    const draftQuery = vi.mocked(prisma.payroll.findMany).mock.calls.map(([c]) => c as any).find((c) => c.where.status === 'DRAFT')
    expect(draftQuery.where).toMatchObject({ month: 12, year: 2024, userId: { in: ['emp-1'] }, deletedAt: null })
    expect(payload.criticalWarning).toContain('เลขงวดเงินประกันเดือนนี้อาจซ้ำ')
    expect(data.securityDepositDraftWarning).toContain('พนักงาน หนึ่ง')
    vi.mocked(prisma.payroll.findMany).mockResolvedValue([] as any)
  })

  it('no deposit warning when last month is not DRAFT (or there is no plan)', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([employee] as any)
    const res = await POST(makeReq({ month: 1, year: 2025 }))
    const data = await res.json()
    expect(data.securityDepositDraftWarning).toBeUndefined()
  })

  it('warns in the row when total deductions exceed total income, quoting both totals', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([employee] as any)
    vi.mocked(countUnrecordedAbsenceDays).mockReturnValue(30) // 30 × 1,000 + SS 750 (2025 ceiling) = 30,750 > 30,000

    await POST(makeReq({ month: 1, year: 2025 }))
    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any

    expect(payload.criticalWarning).toContain('ยอดหักรวม ฿30,750 มากกว่ารายได้รวม ฿30,000')
    expect(payload.netSalary).toBe(0)
  })

  it('warns (row + response) when a monthly base salary is over 500,000, but still generates', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ ...employee, baseSalary: 3_000_000 }] as any)

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    expect(res.status).toBe(200)
    const data = await res.json()
    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any

    expect(data.count).toBe(1)
    expect(payload.criticalWarning).toContain('เกิน ฿500,000')
    expect(data.highBaseSalaryWarning).toContain('พนักงาน หนึ่ง')
  })

  it('no high-salary warning at exactly 500,000', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ ...employee, baseSalary: 500_000 }] as any)
    const res = await POST(makeReq({ month: 1, year: 2025 }))
    const data = await res.json()
    expect(data.highBaseSalaryWarning).toBeUndefined()
  })
})

describe('POST /api/payroll/generate — SS ceiling by year (2026-10)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.payroll.findMany).mockResolvedValue([] as any)
    vi.mocked(prisma.payroll.upsert).mockResolvedValue({ id: 'payroll-x' } as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({ status: 'DRAFT' } as any)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([] as any)
    vi.mocked(computeMonthlyTax).mockReturnValue({ monthlyWithholding: 0 } as any)
  })

  const employees = [
    { id: 'emp-1', name: 'คนมีประกันสังคม', baseSalary: 20000, payType: 'MONTHLY', socialSecurity: true, startDate: new Date('2020-01-01'), branchId: 'b1' },
    { id: 'emp-2', name: 'คนนอกระบบ', baseSalary: 20000, payType: 'MONTHLY', taxScheme: 'OFF_SYSTEM_WHT', socialSecurity: true, startDate: new Date('2020-01-01'), branchId: 'b1' },
  ]
  const payloadFor = (userId: string) =>
    vi.mocked(prisma.payroll.upsert).mock.calls.find((c) => (c[0].where as any).userId_month_year.userId === userId)![0].update as any

  it('year in the table (2028 = พ.ศ. 2571): no ceiling warning anywhere', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue(employees as any)
    const res = await POST(makeReq({ month: 1, year: 2028 }))
    const data = await res.json()
    expect(data.ssCeilingWarning).toBeUndefined()
    expect(payloadFor('emp-1').socialSecurity).toBe(875)
    expect(payloadFor('emp-1').criticalWarning).toBeNull()
  })

  it('year not in the table (2029): uses the latest ceiling (17,500 → 875) and warns HR on the row + in the response', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue(employees as any)
    const res = await POST(makeReq({ month: 1, year: 2029 }))
    const data = await res.json()

    const p1 = payloadFor('emp-1')
    expect(p1.socialSecurity).toBe(875)
    expect(p1.criticalWarning).toContain('ยังไม่มีเพดานประกันสังคมของปี พ.ศ. 2572')
    // OFF_SYSTEM_WHT has no SS at all, so the ceiling is irrelevant → no warning on that row
    expect(payloadFor('emp-2').socialSecurity).toBe(0)
    expect(payloadFor('emp-2').criticalWarning).toBeNull()

    expect(data.ssCeilingWarning).toContain('พ.ศ. 2572')
    expect(data.ssCeilingWarning).toContain('(1 คนที่คิดประกันสังคมงวดนี้)')
  })
})
