import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    payroll: { findUnique: vi.fn(), update: vi.fn() },
    user: { findFirst: vi.fn() },
  },
}))

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

vi.mock('@/lib/access-control', () => ({
  HR_ROLES: ['HR', 'MANAGER_HR', 'ADMIN', 'SUPER_ADMIN', 'CEO'],
  canApprovePayroll: vi.fn((role: string) => ['HR', 'MANAGER_HR', 'ADMIN', 'SUPER_ADMIN', 'CEO'].includes(role)),
  PAYROLL_DELETE_ROLES: ['SUPER_ADMIN', 'CEO'],
}))

vi.mock('@/lib/branch-scope', () => ({
  buildBranchScope: vi.fn().mockReturnValue({}),
  branchUserWhere: vi.fn((_scope: unknown, extra?: Record<string, unknown>) => extra ?? {}),
}))

vi.mock('@/lib/notifications', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/soft-delete', () => ({
  softDelete: vi.fn(),
}))

vi.mock('@/lib/payroll-totals', () => ({
  computePayrollTotals: vi.fn().mockReturnValue({
    socialSecurity: 111, taxDeduction: 22, taxDetail: '{"mock":true}', netSalary: 9999,
  }),
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/notifications'
import { computePayrollTotals } from '@/lib/payroll-totals'
import { GET, PATCH } from '@/app/api/payroll/[id]/route'

const hrSession = { user: { id: 'hr-1', name: 'HR', role: 'HR', branchId: null } }
const empSession = { user: { id: 'emp-1', name: 'Emp', role: 'EMPLOYEE', branchId: null } }

const deletedPayroll = {
  id: 'pay-1', userId: 'emp-1', month: 1, year: 2025, status: 'APPROVED',
  deletedAt: new Date('2026-08-01'), deletedById: 'super-1',
  user: { id: 'emp-1', name: 'A', employeeId: 'E1', department: 'IT', position: 'Dev', socialSecurity: true, baseSalary: 30000, branchId: null },
}

const draftPayroll = {
  id: 'pay-2', userId: 'emp-1', month: 1, year: 2025, status: 'DRAFT', deletedAt: null,
  baseSalary: 30000, positionAllowance: 0, diligenceAllowance: 0, backPay: 0, commission: 0,
  overtimePay: 0, bonus: 0, taxScheme: 'NORMAL',
  professionalFee: 0, professionalFeeTax: 0, studentLoanDeduction: 0, securityDepositDeduction: 0,
  lateDeduction: 0, absentDeduction: 0, unpaidLeave: 0, earlyLeaveDeduction: 0,
  netSalary: 30000,
  user: { socialSecurity: true },
}

const approvedPayroll = { ...draftPayroll, id: 'pay-3', status: 'APPROVED' }

function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('GET /api/payroll/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 404 for a soft-deleted payroll, even to HR', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue(deletedPayroll as any)
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'emp-1' } as any)

    const res = await GET(new NextRequest('http://localhost/api/payroll/pay-1'), ctx('pay-1'))
    expect(res.status).toBe(404)
  })

  it('returns 404 for a soft-deleted payroll owned by the requesting employee', async () => {
    vi.mocked(auth).mockResolvedValue(empSession as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue(deletedPayroll as any)

    const res = await GET(new NextRequest('http://localhost/api/payroll/pay-1'), ctx('pay-1'))
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/payroll/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 404 and never updates a soft-deleted payroll', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue(deletedPayroll as any)

    const req = new NextRequest('http://localhost/api/payroll/pay-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'APPROVED' }),
    })
    const res = await PATCH(req, ctx('pay-1'))
    expect(res.status).toBe(404)
    expect(prisma.payroll.update).not.toHaveBeenCalled()
  })

  it('rejects editing backPay/commission on a non-DRAFT payroll (locked after approve)', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue(approvedPayroll as any)
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'emp-1' } as any)

    const req = new NextRequest('http://localhost/api/payroll/pay-3', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ backPay: 5000 }),
    })
    const res = await PATCH(req, ctx('pay-3'))
    expect(res.status).toBe(400)
    expect(prisma.payroll.update).not.toHaveBeenCalled()
  })

  it('rejects a negative backPay value', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue(draftPayroll as any)
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'emp-1' } as any)

    const req = new NextRequest('http://localhost/api/payroll/pay-2', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ backPay: -100 }),
    })
    const res = await PATCH(req, ctx('pay-2'))
    expect(res.status).toBe(400)
    expect(prisma.payroll.update).not.toHaveBeenCalled()
  })

  it('accepts backPay edit on a DRAFT payroll, recomputes totals via computePayrollTotals, and audit-logs the change', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue(draftPayroll as any)
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'emp-1' } as any)
    vi.mocked(prisma.payroll.update).mockResolvedValue({
      ...draftPayroll, backPay: 5000, netSalary: 9999, socialSecurity: 111, taxDeduction: 22,
    } as any)

    const req = new NextRequest('http://localhost/api/payroll/pay-2', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ backPay: 5000 }),
    })
    const res = await PATCH(req, ctx('pay-2'))
    expect(res.status).toBe(200)

    // Server recomputes via computePayrollTotals — never trusts a client-sent netSalary
    expect(computePayrollTotals).toHaveBeenCalledWith(
      expect.objectContaining({ backPay: 5000, commission: 0, socialSecurityEnabled: true }),
    )
    const updateArg = vi.mocked(prisma.payroll.update).mock.calls[0][0] as any
    expect(updateArg.data.backPay).toBe(5000)
    expect(updateArg.data.netSalary).toBe(9999)
    expect(updateArg.data.socialSecurity).toBe(111)
    expect(updateArg.data.taxDeduction).toBe(22)

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ targetId: 'emp-1', targetType: 'Payroll', action: 'UPDATE' }),
    )
  })

  it('leaves commission untouched (uses existing value) when only backPay is sent', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({ ...draftPayroll, commission: 777 } as any)
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'emp-1' } as any)
    vi.mocked(prisma.payroll.update).mockResolvedValue({ ...draftPayroll } as any)

    const req = new NextRequest('http://localhost/api/payroll/pay-2', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ backPay: 1000 }),
    })
    await PATCH(req, ctx('pay-2'))

    expect(computePayrollTotals).toHaveBeenCalledWith(
      expect.objectContaining({ backPay: 1000, commission: 777 }),
    )
  })

  it('rejects editing overtimePay/bonus on a non-DRAFT payroll (same lock as backPay/commission)', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue(approvedPayroll as any)
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'emp-1' } as any)

    const req = new NextRequest('http://localhost/api/payroll/pay-3', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ overtimePay: 2000 }),
    })
    const res = await PATCH(req, ctx('pay-3'))
    expect(res.status).toBe(400)
    expect(prisma.payroll.update).not.toHaveBeenCalled()
  })

  it('rejects a negative overtimePay/bonus value', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue(draftPayroll as any)
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'emp-1' } as any)

    const reqOt = new NextRequest('http://localhost/api/payroll/pay-2', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ overtimePay: -1 }),
    })
    expect((await PATCH(reqOt, ctx('pay-2'))).status).toBe(400)

    const reqBonus = new NextRequest('http://localhost/api/payroll/pay-2', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bonus: -1 }),
    })
    expect((await PATCH(reqBonus, ctx('pay-2'))).status).toBe(400)
    expect(prisma.payroll.update).not.toHaveBeenCalled()
  })

  it('accepts overtimePay/bonus edit on a DRAFT payroll, feeds computePayrollTotals, and audit-logs before/after', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({ ...draftPayroll, overtimePay: 0, bonus: 0 } as any)
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'emp-1' } as any)
    vi.mocked(prisma.payroll.update).mockResolvedValue({
      ...draftPayroll, overtimePay: 3000, bonus: 6000, netSalary: 9999, socialSecurity: 111, taxDeduction: 22,
    } as any)

    const req = new NextRequest('http://localhost/api/payroll/pay-2', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ overtimePay: 3000, bonus: 6000 }),
    })
    const res = await PATCH(req, ctx('pay-2'))
    expect(res.status).toBe(200)

    expect(computePayrollTotals).toHaveBeenCalledWith(
      expect.objectContaining({ overtimePay: 3000, bonus: 6000, backPay: 0, commission: 0 }),
    )
    const updateArg = vi.mocked(prisma.payroll.update).mock.calls[0][0] as any
    expect(updateArg.data.overtimePay).toBe(3000)
    expect(updateArg.data.bonus).toBe(6000)
    // Server always recomputes via the (mocked) computePayrollTotals — never
    // trusts a client-sent total, same principle as the backPay test above.
    expect(updateArg.data.netSalary).toBe(9999)

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        targetId: 'emp-1', targetType: 'Payroll', action: 'UPDATE',
        before: expect.objectContaining({ overtimePay: 0, bonus: 0 }),
        after: expect.objectContaining({ overtimePay: 3000, bonus: 6000 }),
      }),
    )
  })

  it('leaves overtimePay/bonus untouched (uses existing value) when only backPay is sent', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue(
      { ...draftPayroll, overtimePay: 1500, bonus: 2500 } as any,
    )
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'emp-1' } as any)
    vi.mocked(prisma.payroll.update).mockResolvedValue({ ...draftPayroll } as any)

    const req = new NextRequest('http://localhost/api/payroll/pay-2', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ backPay: 1000 }),
    })
    await PATCH(req, ctx('pay-2'))

    expect(computePayrollTotals).toHaveBeenCalledWith(
      expect.objectContaining({ overtimePay: 1500, bonus: 2500 }),
    )
  })
})
