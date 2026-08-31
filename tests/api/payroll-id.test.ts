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

vi.mock('@/lib/access-control', () => ({
  HR_ROLES: ['HR', 'MANAGER_HR', 'ADMIN', 'SUPER_ADMIN', 'CEO'],
  canApprovePayroll: vi.fn((role: string) => ['HR', 'MANAGER_HR', 'ADMIN', 'SUPER_ADMIN', 'CEO'].includes(role)),
}))

vi.mock('@/lib/branch-scope', () => ({
  buildBranchScope: vi.fn().mockReturnValue({}),
  branchUserWhere: vi.fn((_scope: unknown, extra?: Record<string, unknown>) => extra ?? {}),
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GET, PATCH } from '@/app/api/payroll/[id]/route'

const hrSession = { user: { id: 'hr-1', name: 'HR', role: 'HR', branchId: null } }
const empSession = { user: { id: 'emp-1', name: 'Emp', role: 'EMPLOYEE', branchId: null } }

const deletedPayroll = {
  id: 'pay-1', userId: 'emp-1', month: 1, year: 2025, status: 'APPROVED',
  deletedAt: new Date('2026-08-01'), deletedById: 'super-1',
  user: { id: 'emp-1', name: 'A', employeeId: 'E1', department: 'IT', position: 'Dev', socialSecurity: true, baseSalary: 30000, branchId: null },
}

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
})
