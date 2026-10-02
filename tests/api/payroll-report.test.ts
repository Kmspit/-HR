import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: vi.fn(), findFirst: vi.fn() },
    payroll: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/branch-scope', () => ({
  buildBranchScope: vi.fn().mockReturnValue({}),
  branchUserWhere: vi.fn((_scope: unknown, extra: unknown) => extra ?? {}),
  branchNestedUserWhere: vi.fn().mockReturnValue(undefined),
  parseBranchQueryParam: vi.fn().mockReturnValue(undefined),
}))

vi.mock('@/lib/notifications', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/access-control', () => ({
  canManagePayroll: vi.fn((role: string) => ['HR', 'MANAGER_HR', 'ADMIN', 'CEO', 'SUPER_ADMIN'].includes(role)),
  canApprovePayroll: vi.fn().mockReturnValue(true),
}))

vi.mock('@/lib/ensure-payroll-payslip-columns', () => ({
  ensurePayrollPayslipColumns: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/ensure-payroll-fields-batch-2', () => ({
  ensurePayrollFieldsBatch2: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/cloudinary-service', () => ({
  isCloudinaryConfigured: vi.fn().mockReturnValue(true),
}))

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/payroll/report/route'

// ── Helpers ──────────────────────────────────────────────────────────────────

const hrSession = { user: { id: 'hr-1', name: 'HR', role: 'HR', branchId: null } }

function makeReq(query: string) {
  return new NextRequest(`http://localhost/api/payroll/report?${query}`)
}

describe('GET /api/payroll/report — payType/daysWorked/dailyRateUsed pass-through', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(hrSession as any)
  })

  it('passes through payType/daysWorked/dailyRateUsed from an existing DAILY payroll row', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-d1', name: 'พนักงาน รายวัน', employeeId: 'D1', department: 'ฝ่ายผลิต', position: 'พนักงาน', socialSecurity: true, baseSalary: null, payType: 'DAILY', dailyRate: 300, lineUserId: null },
    ] as any)
    vi.mocked(prisma.payroll.findMany).mockResolvedValue([
      {
        id: 'pr-1', userId: 'emp-d1', baseSalary: 1050, lateDeduction: 0, absentDeduction: 0,
        unpaidLeave: 0, socialSecurity: 52.5, taxDeduction: 20, taxDetail: null, netSalary: 977.5,
        lateDays: 0, absentDays: 0, lateMinutes: 0, lateBillableMinutes: 0, lateDeductionDetail: null,
        payType: 'DAILY', daysWorked: 3.5, dailyRateUsed: 300,
        status: 'DRAFT', note: null,
        payslipSentAt: null, payslipSentVia: null, payslipSentStatus: null, payslipSentError: null,
        user: { name: 'พนักงาน รายวัน', employeeId: 'D1', department: 'ฝ่ายผลิต', position: 'พนักงาน', socialSecurity: true },
      },
    ] as any)

    const res = await GET(makeReq('month=1&year=2025'))
    expect(res.status).toBe(200)
    const data = await res.json()

    expect(data.payrolls).toHaveLength(1)
    const row = data.payrolls[0]
    expect(row.payType).toBe('DAILY')
    expect(row.daysWorked).toBe(3.5)
    expect(row.dailyRateUsed).toBe(300)
    expect(row.baseSalary).toBe(1050)
    expect(row.hasPayroll).toBe(true)
  })

  it('defaults payType to MONTHLY for an existing payroll row with a null payType (pre-feature legacy row)', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-1', name: 'พนักงาน หนึ่ง', employeeId: 'E1', department: 'ฝ่ายบุคคล', position: 'พนักงาน', socialSecurity: true, baseSalary: 30000, payType: 'MONTHLY', dailyRate: null, lineUserId: null },
    ] as any)
    vi.mocked(prisma.payroll.findMany).mockResolvedValue([
      {
        id: 'pr-1', userId: 'emp-1', baseSalary: 30000, lateDeduction: 0, absentDeduction: 0,
        unpaidLeave: 0, socialSecurity: 750, taxDeduction: 0, taxDetail: null, netSalary: 29250,
        lateDays: 0, absentDays: 0, lateMinutes: 0, lateBillableMinutes: 0, lateDeductionDetail: null,
        payType: null, daysWorked: null, dailyRateUsed: null,
        status: 'DRAFT', note: null,
        payslipSentAt: null, payslipSentVia: null, payslipSentStatus: null, payslipSentError: null,
        user: { name: 'พนักงาน หนึ่ง', employeeId: 'E1', department: 'ฝ่ายบุคคล', position: 'พนักงาน', socialSecurity: true },
      },
    ] as any)

    const res = await GET(makeReq('month=1&year=2025'))
    const data = await res.json()

    expect(data.payrolls[0].payType).toBe('MONTHLY')
    expect(data.payrolls[0].daysWorked).toBeNull()
  })

  it('for an employee with no payroll generated yet, previews payType/dailyRate from the User record (daysWorked null — not knowable until generate)', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-d2', name: 'พนักงาน ฝึกงาน', employeeId: 'D2', department: 'ฝ่ายไอที', position: 'ฝึกงาน', socialSecurity: false, baseSalary: null, payType: 'DAILY', dailyRate: 350, lineUserId: null },
    ] as any)
    vi.mocked(prisma.payroll.findMany).mockResolvedValue([] as any)

    const res = await GET(makeReq('month=1&year=2025'))
    const data = await res.json()

    expect(data.payrolls).toHaveLength(1)
    const row = data.payrolls[0]
    expect(row.hasPayroll).toBe(false)
    expect(row.payType).toBe('DAILY')
    expect(row.dailyRateUsed).toBe(350)
    expect(row.daysWorked).toBeNull()
    expect(row.baseSalary).toBe(0) // no User.baseSalary for a DAILY-only employee
  })

  it('a MONTHLY employee with no payroll yet still previews baseSalary as before (unaffected)', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-2', name: 'พนักงาน สอง', employeeId: 'E2', department: 'ฝ่ายบุคคล', position: 'พนักงาน', socialSecurity: true, baseSalary: 25000, payType: 'MONTHLY', dailyRate: null, lineUserId: null },
    ] as any)
    vi.mocked(prisma.payroll.findMany).mockResolvedValue([] as any)

    const res = await GET(makeReq('month=1&year=2025'))
    const data = await res.json()

    const row = data.payrolls[0]
    expect(row.payType).toBe('MONTHLY')
    expect(row.baseSalary).toBe(25000)
    expect(row.dailyRateUsed).toBeNull()
  })
})

/**
 * Bug found 2026-10-02: an employee disabled mid-period (the real case —
 * isrwd.bml@gmail.com, month=10/year=2026) had her payroll row correctly
 * generated by POST /api/payroll/generate, but this GET route — which
 * PayrollClient.tsx refetches right after clicking "generate" — independently
 * hardcoded `status: 'ACTIVE'` for its employee list, so her row existed in
 * the DB but could never come back in this response. Fixed by routing
 * through the shared lib/payroll-employee-scope.ts condition instead.
 */
describe('GET /api/payroll/report — includes DISABLED-in-period employees (2026-10-02 bug fix)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(hrSession as any)
  })

  it('queries user.findMany with the same ACTIVE-or-DISABLED-in-period OR condition generate/route.ts uses', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as any)
    vi.mocked(prisma.payroll.findMany).mockResolvedValue([] as any)

    await GET(makeReq('month=10&year=2026'))

    const call = vi.mocked(prisma.user.findMany).mock.calls[0][0] as any
    expect(call.where.role).toEqual({ in: ['EMPLOYEE', 'MANAGER_HR', 'LAWYER'] })
    expect(call.where.OR[0]).toEqual({ status: 'ACTIVE' })
    expect(call.where.OR[1]).toEqual({
      status: 'DISABLED',
      updatedAt: { gte: new Date(2026, 8, 21), lte: new Date(2026, 9, 20, 23, 59, 59, 999) },
    })
  })

  it('includes a DISABLED-in-period employee\'s existing payroll row in the response — the exact isrwd.bml@gmail.com regression', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-disabled', name: 'นางสาวอิสราวดี บุญมาเลิศ', employeeId: 'E9', department: 'ฝ่ายบัญชี', position: 'พนักงาน', socialSecurity: true, baseSalary: 30000, payType: 'MONTHLY', dailyRate: null, lineUserId: null },
    ] as any)
    vi.mocked(prisma.payroll.findMany).mockResolvedValue([
      {
        id: 'pr-disabled', userId: 'emp-disabled', baseSalary: 30000, lateDeduction: 0, absentDeduction: 0,
        unpaidLeave: 0, socialSecurity: 0, taxDeduction: 258.33, taxDetail: null, netSalary: 27309.01,
        lateDays: 0, absentDays: 0, lateMinutes: 0, lateBillableMinutes: 0, lateDeductionDetail: null,
        payType: 'MONTHLY', daysWorked: null, dailyRateUsed: null,
        status: 'DRAFT',
        note: '⚠️ บัญชีถูกปิดใช้งานในเดือนนี้ (แก้ไขล่าสุด 2/10/2569) — ระบบไม่ทราบวันทำงานสุดท้ายที่แน่นอน จึงคำนวณเป็นเงินเดือนเต็มจำนวน กรุณาตรวจสอบและปรับยอดก่อนอนุมัติ',
        payslipSentAt: null, payslipSentVia: null, payslipSentStatus: null, payslipSentError: null,
        user: { name: 'นางสาวอิสราวดี บุญมาเลิศ', employeeId: 'E9', department: 'ฝ่ายบัญชี', position: 'พนักงาน', socialSecurity: true },
      },
    ] as any)

    const res = await GET(makeReq('month=10&year=2026'))
    const data = await res.json()

    expect(data.payrolls).toHaveLength(1)
    expect(data.payrolls[0].name).toBe('นางสาวอิสราวดี บุญมาเลิศ')
    expect(data.payrolls[0].hasPayroll).toBe(true)
    expect(data.payrolls[0].netSalary).toBe(27309.01)
  })

  it('still excludes a DISABLED employee updated well before this payroll period (not everyone-DISABLED — only in-period)', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as any)
    vi.mocked(prisma.payroll.findMany).mockResolvedValue([] as any)

    await GET(makeReq('month=10&year=2026'))

    const call = vi.mocked(prisma.user.findMany).mock.calls[0][0] as any
    const longAgoDisabled = new Date('2026-01-01T00:00:00.000Z')
    const { gte, lte } = call.where.OR[1].updatedAt
    expect(longAgoDisabled >= gte && longAgoDisabled <= lte).toBe(false)
  })
})
