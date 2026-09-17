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
