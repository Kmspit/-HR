import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    payroll:      { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    user:         { findMany: vi.fn(), findFirst: vi.fn() },
    leave:        { findMany: vi.fn() },
    attendance:   { findMany: vi.fn() },
    companyHoliday: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/notifications', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

vi.mock('@/lib/ensure-db-schema', () => ({
  ensureDbSchema: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/ensure-payroll-payslip-columns', () => ({
  ensurePayrollPayslipColumns: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/payroll-late-deduction', () => ({
  buildApprovedLeaveDateSet:       vi.fn().mockReturnValue(new Set()),
  computeLateDeduction:            vi.fn().mockReturnValue({ totalDeduction: 0, details: [] }),
  serializeLateDeductionDetail:    vi.fn().mockReturnValue([]),
}))

vi.mock('@/lib/payroll-tax', () => ({
  computeMonthlyTax: vi.fn().mockReturnValue(0),
}))

vi.mock('@/lib/branch-scope', () => ({
  buildBranchScope:        vi.fn().mockReturnValue({}),
  branchUserWhere:         vi.fn().mockReturnValue({}),
  branchNestedUserWhere:   vi.fn().mockReturnValue({}),
  parseBranchQueryParam:   vi.fn().mockReturnValue(undefined),
}))

vi.mock('@/lib/utils', () => ({
  monthDateRange: vi.fn().mockReturnValue({ start: new Date('2025-01-01'), end: new Date('2025-01-31') }),
}))

vi.mock('@/lib/api-guard', () => ({
  requireCsrf: vi.fn().mockReturnValue(null),
}))

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GET as reportGet, PATCH as reportPatch } from '@/app/api/payroll/report/route'

// ── Helpers ────────────────────────────────────────────────────────────────────

const hrSession  = { user: { id: 'hr-1',  name: 'HR', role: 'HR',       branchId: null } }
const empSession = { user: { id: 'emp-1', name: 'Emp', role: 'EMPLOYEE', branchId: null } }

const mockPayroll = {
  id: 'pay-1', userId: 'emp-1', month: 1, year: 2025,
  baseSalary: 30000, netSalary: 28000, tax: 500, socialSecurity: 750, totalDeductions: 2000,
  user: { name: 'Test Employee', employeeId: 'EMP001', department: 'IT', position: 'Dev', socialSecurity: true },
}

function makeReportReq(params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ month: '1', year: '2025', ...params }).toString()
  return new NextRequest(`http://localhost/api/payroll/report?${qs}`)
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('GET /api/payroll/report', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await reportGet(makeReportReq())
    expect(res.status).toBe(401)
  })

  it('returns own payroll for EMPLOYEE role', async () => {
    vi.mocked(auth).mockResolvedValue(empSession as any)
    vi.mocked(prisma.payroll.findMany).mockResolvedValue([mockPayroll] as any)

    const res = await reportGet(makeReportReq())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.payrolls).toHaveLength(1)
  })

  it('returns 403 when employee tries to view other user payroll', async () => {
    vi.mocked(auth).mockResolvedValue(empSession as any)

    const res = await reportGet(makeReportReq({ userId: 'other-emp-99' }))
    expect(res.status).toBe(403)
  })

  it('returns payroll list for HR role', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-1', name: 'A', employeeId: 'E1', department: 'IT', position: 'Dev', socialSecurity: true, baseSalary: 30000 },
      { id: 'emp-2', name: 'B', employeeId: 'E2', department: 'HR', position: 'Staff', socialSecurity: true, baseSalary: 25000 },
    ] as any)
    vi.mocked(prisma.payroll.findMany).mockResolvedValue([mockPayroll, { ...mockPayroll, id: 'pay-2', userId: 'emp-2' }] as any)

    const res = await reportGet(makeReportReq())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json.payrolls)).toBe(true)
    expect(json.payrolls.length).toBeGreaterThanOrEqual(1)
  })

  it('never includes the raw nationalId in the response — only a derived nationalIdStatus', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    const SECRET_NATIONAL_ID = '1234567890123'
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'emp-1', name: 'A', employeeId: 'E1', department: 'IT', position: 'Dev', socialSecurity: true, baseSalary: 30000, lineUserId: 'U1', nationalId: SECRET_NATIONAL_ID },
      { id: 'emp-2', name: 'B', employeeId: 'E2', department: 'HR', position: 'Staff', socialSecurity: true, baseSalary: 25000, lineUserId: null, nationalId: null },
    ] as any)
    vi.mocked(prisma.payroll.findMany).mockResolvedValue([mockPayroll] as any)

    const res = await reportGet(makeReportReq())
    expect(res.status).toBe(200)
    const rawBody = await res.text()

    // The raw digits must never appear anywhere in the response body.
    expect(rawBody).not.toContain(SECRET_NATIONAL_ID)
    // And no row may carry a `nationalId` key at all — only the derived status.
    const json = JSON.parse(rawBody)
    for (const row of json.payrolls) {
      expect(row).not.toHaveProperty('nationalId')
      expect(['MASKED', 'MISSING', 'INVALID']).toContain(row.nationalIdStatus)
    }
    const withSecret = json.payrolls.find((r: { userId: string }) => r.userId === 'emp-1')
    expect(withSecret.nationalIdStatus).toBe('MASKED')
    const withoutSecret = json.payrolls.find((r: { userId: string }) => r.userId === 'emp-2')
    expect(withoutSecret.nationalIdStatus).toBe('MISSING')
  })

  it('returns specific user payroll for HR querying by userId', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'emp-1' } as any)
    vi.mocked(prisma.payroll.findMany).mockResolvedValue([mockPayroll] as any)

    const res = await reportGet(makeReportReq({ userId: 'emp-1' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.payrolls).toHaveLength(1)
    expect(json.payrolls[0].userId).toBe('emp-1')
  })
})

describe('PATCH /api/payroll/report branch scope', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 when payroll user is outside branch scope', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({
      id: 'pay-1', userId: 'emp-other', month: 1, year: 2025, status: 'PENDING',
    } as any)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/payroll/report', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'pay-1', status: 'APPROVED' }),
    })
    const res = await reportPatch(req)
    expect(res.status).toBe(403)
    expect(prisma.payroll.update).not.toHaveBeenCalled()
  })
})
