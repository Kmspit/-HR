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

// Static mock matching the REAL payrollPeriodRange(1, 2025) result — 21 Dec
// 2024 through 20 Jan 2025, not calendar-month Jan 1-31. Every existing test
// in this file requests {month:1, year:2025} and uses attendance/updatedAt
// fixtures already comfortably inside this window (see payroll-period.test.ts
// for the function's own dedicated edge-case tests, incl. this exact
// year-rollover case) — only the one test asserting the literal query
// boundary (below) needed updating for the new dates.
vi.mock('@/lib/payroll-period', () => ({
  payrollPeriodRange: vi.fn().mockReturnValue({
    start: new Date(2024, 11, 21),
    end: new Date(2025, 0, 20, 23, 59, 59, 999),
  }),
}))

vi.mock('@/lib/branch-scope', () => ({
  buildBranchScope: vi.fn().mockReturnValue({}),
  branchUserWhere:  vi.fn((_scope: unknown, extra: unknown) => extra ?? {}),
}))

vi.mock('@/lib/api-guard', () => ({
  requireCsrf: vi.fn().mockReturnValue(null),
}))

vi.mock('@/lib/payroll-late-deduction', () => ({
  buildApprovedLeaveDateSet:    vi.fn().mockReturnValue(new Set()),
  computeLateDeduction:         vi.fn().mockReturnValue({ lateDeduction: 0, lateDays: 0, billableLateMinutes: 0, lines: [] }),
  serializeLateDeductionDetail: vi.fn().mockReturnValue('[]'),
  roundMoney:                   (n: number) => Math.round(n * 100) / 100,
}))

vi.mock('@/lib/payroll-tax', () => ({
  computeMonthlyTax: vi.fn().mockReturnValue({ monthlyWithholding: 0 }),
  computeOffSystemWht: vi.fn().mockReturnValue({ monthlyWithholding: 0 }),
}))

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { computeLateDeduction } from '@/lib/payroll-late-deduction'
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

describe('POST /api/payroll/generate — includes employees deactivated this month', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.payroll.upsert).mockResolvedValue({ id: 'payroll-x' } as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({ status: 'DRAFT' } as any)
    vi.mocked(prisma.payroll.findMany).mockResolvedValue([] as any)
  })

  it('queries with an OR of ACTIVE and (DISABLED + updatedAt in this PAYROLL PERIOD, 21 Dec – 20 Jan — not calendar-month Jan 1-31)', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as any)
    await POST(makeReq({ month: 1, year: 2025 }))

    const call = vi.mocked(prisma.user.findMany).mock.calls[0][0] as any
    expect(call.where.OR).toEqual([
      { status: 'ACTIVE' },
      {
        status: 'DISABLED',
        updatedAt: { gte: new Date(2024, 11, 21), lte: new Date(2025, 0, 20, 23, 59, 59, 999) },
      },
    ])
  })

  it('includes a DISABLED employee at full nominal salary with a review-me note, and reports it back', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: 'emp-3', name: 'พนักงาน สาม', baseSalary: 20000, socialSecurity: true, branchId: 'b1',
        status: 'DISABLED', updatedAt: new Date('2025-01-20'),
      },
    ] as any)

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    expect(res.status).toBe(200)
    const data = await res.json()

    expect(data.count).toBe(1)
    expect(data.disabledIncluded).toEqual([{ userId: 'emp-3', name: 'พนักงาน สาม' }])
    expect(data.disabledWarning).toContain('พนักงาน สาม')

    const upsertCalls = vi.mocked(prisma.payroll.upsert).mock.calls
    expect(upsertCalls).toHaveLength(1)
    const payload = upsertCalls[0][0].update
    expect(payload.baseSalary).toBe(20000) // full nominal amount, not shrunk
    expect(payload.note).toContain('ปิดใช้งานในเดือนนี้')
    expect(payload.note).toContain('ตรวจสอบและปรับยอดก่อนอนุมัติ')
  })

  it('does not flag or warn about a normal ACTIVE employee', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-1', name: 'พนักงาน หนึ่ง', baseSalary: 30000, socialSecurity: true, branchId: 'b1', status: 'ACTIVE' },
    ] as any)

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    const data = await res.json()

    expect(data.disabledIncluded).toEqual([])
    expect(data.disabledWarning).toBeUndefined()
  })

  it('splits disabledWarning into separate MONTHLY- and DAILY-worded messages when both pay types are disabled this month', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: 'emp-3', name: 'พนักงาน เดือน', baseSalary: 20000, socialSecurity: true, branchId: 'b1',
        status: 'DISABLED', updatedAt: new Date('2025-01-20'), payType: 'MONTHLY',
      },
      {
        id: 'emp-4', name: 'พนักงาน วัน', baseSalary: null, dailyRate: 300, socialSecurity: true, branchId: 'b1',
        status: 'DISABLED', updatedAt: new Date('2025-01-15'), payType: 'DAILY',
      },
    ] as any)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([] as any)

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    expect(res.status).toBe(200)
    const data = await res.json()

    expect(data.disabledIncluded).toEqual([
      { userId: 'emp-3', name: 'พนักงาน เดือน' },
      { userId: 'emp-4', name: 'พนักงาน วัน' },
    ])
    // Two distinct messages joined by ' | ' — MONTHLY's "ยอดเต็มเดือน (ยังไม่
    // prorate)" wording must not bleed onto the DAILY employee, whose pay
    // already only reflects days actually worked before being disabled.
    const parts = data.disabledWarning.split(' | ')
    expect(parts).toHaveLength(2)
    expect(parts[0]).toContain('พนักงานรายเดือน')
    expect(parts[0]).toContain('ยอดเต็มเดือน')
    expect(parts[0]).toContain('พนักงาน เดือน')
    expect(parts[0]).not.toContain('พนักงาน วัน')
    expect(parts[1]).toContain('พนักงานรายวัน')
    expect(parts[1]).toContain('จำนวนวันที่มาทำงานจริง')
    expect(parts[1]).toContain('พนักงาน วัน')
    expect(parts[1]).not.toContain('พนักงาน เดือน')
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
    const customStart = new Date(2026, 7, 21) // 21 Aug 2026
    const customEnd = new Date(2026, 8, 20, 23, 59, 59, 999) // 20 Sep 2026
    vi.mocked(payrollPeriodRange).mockReturnValueOnce({ start: customStart, end: customEnd })

    await POST(makeReq({ month: 9, year: 2026 }))

    expect(payrollPeriodRange).toHaveBeenCalledWith(9, 2026)

    const userCall = vi.mocked(prisma.user.findMany).mock.calls[0][0] as any
    expect(userCall.where.OR[1]).toEqual({ status: 'DISABLED', updatedAt: { gte: customStart, lte: customEnd } })

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
    expect(payload.socialSecurity).toBe(52.5) // min(1050 × 0.05, 875)
    expect(payload.taxDeduction).toBe(20)
    expect(payload.netSalary).toBe(977.5) // 1050 - 52.5 - 20
  })

  it('applies no late/absent/unpaid-leave deduction even when attendance would trigger one for a MONTHLY employee', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([dailyEmployee] as any)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([
      attRow('2025-01-05', 'NORMAL'),
      attRow('2025-01-06', 'LATE', { lateMinutes: 999 }), // would be a big deduction for MONTHLY
      attRow('2025-01-07', 'ABSENT', { checkIn: null }),
    ] as any)
    vi.mocked(prisma.leaveRequest.findMany).mockImplementation(({ where }: any) =>
      Promise.resolve(where.type === 'UNPAID' ? [{ userId: 'emp-d1', days: 5 }] : []) as any,
    )

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    expect(res.status).toBe(200)

    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any
    expect(payload.lateDeduction).toBe(0)
    expect(payload.absentDeduction).toBe(0)
    expect(payload.unpaidLeave).toBe(0)
    expect(payload.lateDays).toBe(0)
    expect(payload.absentDays).toBe(0)
    // computeLateDeduction is the MONTHLY-only late-deduction formula — a
    // DAILY employee must never even call it, not just discard its result.
    expect(computeLateDeduction).not.toHaveBeenCalled()
  })

  it('computes SS/tax off daysWorked × dailyRate, not off baseSalary (which is null for a DAILY-only employee)', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([dailyEmployee] as any)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([attRow('2025-01-05', 'NORMAL')] as any)

    await POST(makeReq({ month: 1, year: 2025 }))

    expect(computeMonthlyTax).toHaveBeenCalledWith(300, 15) // 1 day × 300 dailyRate, SS = min(300×0.05, 875) = 15
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
    expect(computeMonthlyTax).toHaveBeenCalledWith(26000, 875) // SS = min(26000×0.05, 875) = 875 (capped)
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

    const res = await POST(makeReq({ month: 1, year: 2025 }))
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

    const res = await POST(makeReq({ month: 1, year: 2025 }))
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

    const res = await POST(makeReq({ month: 1, year: 2025 }))
    expect(res.status).toBe(200)
    const payload = vi.mocked(prisma.payroll.upsert).mock.calls[0][0].update as any

    // periodEarnings = 3 × 6000 = 18000 → min(18000 × 5%, 875) = min(900, 875) = 875 (hits the new cap)
    expect(payload.baseSalary).toBe(18000)
    expect(payload.socialSecurity).toBe(875)
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
