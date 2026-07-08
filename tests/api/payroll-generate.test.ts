import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    companySettings: { findUnique: vi.fn().mockResolvedValue({ absentDeductRate: 0 }) },
    companyHoliday:  { findMany: vi.fn().mockResolvedValue([]) },
    user:            { findMany: vi.fn() },
    attendance:      { findMany: vi.fn().mockResolvedValue([]) },
    leaveRequest:    { findMany: vi.fn().mockResolvedValue([]) },
    payroll:         { findMany: vi.fn(), upsert: vi.fn() },
  },
}))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

vi.mock('@/lib/utils', () => ({
  monthDateRange: vi.fn().mockReturnValue({ start: new Date('2025-01-01'), end: new Date('2025-01-31') }),
}))

vi.mock('@/lib/branch-scope', () => ({
  buildBranchScope: vi.fn().mockReturnValue({}),
  branchUserWhere:  vi.fn().mockReturnValue({}),
}))

vi.mock('@/lib/api-guard', () => ({
  requireCsrf: vi.fn().mockReturnValue(null),
}))

vi.mock('@/lib/payroll-late-deduction', () => ({
  buildApprovedLeaveDateSet:    vi.fn().mockReturnValue(new Set()),
  computeLateDeduction:         vi.fn().mockReturnValue({ lateDeduction: 0, lateDays: 0, billableLateMinutes: 0, lines: [] }),
  serializeLateDeductionDetail: vi.fn().mockReturnValue('[]'),
}))

vi.mock('@/lib/payroll-tax', () => ({
  computeMonthlyTax: vi.fn().mockReturnValue({ monthlyWithholding: 0 }),
}))

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
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
})
