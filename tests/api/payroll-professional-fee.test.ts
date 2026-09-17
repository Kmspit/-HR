import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => {
  const prisma: any = {
    payroll: { findUnique: vi.fn(), update: vi.fn() },
    user: { findFirst: vi.fn() },
    professionalFeePayment: {
      findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), delete: vi.fn(), aggregate: vi.fn(),
    },
    $transaction: vi.fn((cb: any) => cb(prisma)),
  }
  return { prisma }
})

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

vi.mock('@/lib/access-control', () => ({
  canApprovePayroll: vi.fn((role: string) => ['HR', 'MANAGER_HR', 'ADMIN', 'SUPER_ADMIN', 'CEO'].includes(role)),
}))

vi.mock('@/lib/branch-scope', () => ({
  buildBranchScope: vi.fn().mockReturnValue({}),
  branchUserWhere: vi.fn((_scope: unknown, extra?: Record<string, unknown>) => extra ?? {}),
}))

vi.mock('@/lib/notifications', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/ensure-payroll-payslip-columns', () => ({
  ensurePayrollPayslipColumns: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/ensure-payroll-fields-batch-2', () => ({
  ensurePayrollFieldsBatch2: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/payroll-totals', () => ({
  computePayrollTotals: vi.fn().mockReturnValue({
    socialSecurity: 100, taxDeduction: 10, taxDetail: '{}', netSalary: 5000,
  }),
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/notifications'
import { POST, GET } from '@/app/api/payroll/[id]/professional-fee/route'
import { DELETE } from '@/app/api/payroll/[id]/professional-fee/[paymentId]/route'

const hrSession = { user: { id: 'hr-1', name: 'HR', role: 'HR', branchId: null } }

const draftPayroll = {
  id: 'pay-1', userId: 'emp-1', status: 'DRAFT', deletedAt: null,
  baseSalary: 30000, positionAllowance: 0, diligenceAllowance: 0, backPay: 0, commission: 0,
  studentLoanDeduction: 0, securityDepositDeduction: 0, lateDeduction: 0, absentDeduction: 0,
  unpaidLeave: 0, earlyLeaveDeduction: 0,
  user: { socialSecurity: true },
}

function ctxPayroll(id: string) {
  return { params: Promise.resolve({ id }) }
}
function ctxPayment(id: string, paymentId: string) {
  return { params: Promise.resolve({ id, paymentId }) }
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    hiringCompany: 'บริษัท เอ จำกัด',
    jobType: 'ที่ปรึกษากฎหมาย',
    amount: 2000,
    paidAt: '2026-09-01',
    relatedPersons: [{ name: 'สมชาย ใจดี', role: 'ผู้กู้' }],
    ...overrides,
  }
}

describe('POST /api/payroll/[id]/professional-fee', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'emp-1' } as any)
  })

  it('rejects when the payroll is not DRAFT', async () => {
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({ ...draftPayroll, status: 'APPROVED' } as any)

    const req = new NextRequest('http://localhost/x', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBody()),
    })
    const res = await POST(req, ctxPayroll('pay-1'))
    expect(res.status).toBe(400)
    expect(prisma.professionalFeePayment.create).not.toHaveBeenCalled()
  })

  it('rejects missing hiringCompany', async () => {
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue(draftPayroll as any)
    const req = new NextRequest('http://localhost/x', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBody({ hiringCompany: '' })),
    })
    const res = await POST(req, ctxPayroll('pay-1'))
    expect(res.status).toBe(400)
  })

  it('rejects amount <= 0', async () => {
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue(draftPayroll as any)
    const req = new NextRequest('http://localhost/x', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBody({ amount: 0 })),
    })
    const res = await POST(req, ctxPayroll('pay-1'))
    expect(res.status).toBe(400)
  })

  it('rejects when relatedPersons is empty', async () => {
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue(draftPayroll as any)
    const req = new NextRequest('http://localhost/x', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBody({ relatedPersons: [] })),
    })
    const res = await POST(req, ctxPayroll('pay-1'))
    expect(res.status).toBe(400)
  })

  it('computes 3% tax for amount >= 1000, aggregates totals, and recomputes payroll via computePayrollTotals', async () => {
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue(draftPayroll as any)
    vi.mocked(prisma.professionalFeePayment.create).mockResolvedValue({ id: 'fee-1', amount: 2000, taxWithheld: 60 } as any)
    vi.mocked(prisma.professionalFeePayment.aggregate).mockResolvedValue({ _sum: { amount: 2000, taxWithheld: 60 } } as any)

    const req = new NextRequest('http://localhost/x', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBody({ amount: 2000 })),
    })
    const res = await POST(req, ctxPayroll('pay-1'))
    expect(res.status).toBe(200)

    const createArg = vi.mocked(prisma.professionalFeePayment.create).mock.calls[0][0] as any
    expect(createArg.data.taxWithheld).toBe(60) // 2000 × 3%
    expect(createArg.data.relatedPersons.create).toEqual([{ name: 'สมชาย ใจดี', role: 'ผู้กู้' }])

    const updateArg = vi.mocked(prisma.payroll.update).mock.calls[0][0] as any
    expect(updateArg.data.professionalFee).toBe(2000)
    expect(updateArg.data.professionalFeeTax).toBe(60)
    expect(updateArg.data.netSalary).toBe(5000) // from mocked computePayrollTotals

    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE' }))
  })

  it('does not withhold tax for an amount under 1,000 baht', async () => {
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue(draftPayroll as any)
    vi.mocked(prisma.professionalFeePayment.create).mockResolvedValue({ id: 'fee-2', amount: 800, taxWithheld: 0 } as any)
    vi.mocked(prisma.professionalFeePayment.aggregate).mockResolvedValue({ _sum: { amount: 800, taxWithheld: 0 } } as any)

    const req = new NextRequest('http://localhost/x', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBody({ amount: 800 })),
    })
    await POST(req, ctxPayroll('pay-1'))

    const createArg = vi.mocked(prisma.professionalFeePayment.create).mock.calls[0][0] as any
    expect(createArg.data.taxWithheld).toBe(0)
  })
})

describe('GET /api/payroll/[id]/professional-fee', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(hrSession as any)
  })

  it('returns 404 for a soft-deleted payroll', async () => {
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({ id: 'pay-1', userId: 'emp-1', deletedAt: new Date() } as any)
    const res = await GET(new NextRequest('http://localhost/x'), ctxPayroll('pay-1'))
    expect(res.status).toBe(404)
  })

  it('lists payments with relatedPersons included', async () => {
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({ id: 'pay-1', userId: 'emp-1', deletedAt: null } as any)
    vi.mocked(prisma.professionalFeePayment.findMany).mockResolvedValue([{ id: 'fee-1', relatedPersons: [] }] as any)

    const res = await GET(new NextRequest('http://localhost/x'), ctxPayroll('pay-1'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.payments).toHaveLength(1)
  })
})

describe('DELETE /api/payroll/[id]/professional-fee/[paymentId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'emp-1' } as any)
  })

  it('rejects deleting from a non-DRAFT payroll', async () => {
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({ ...draftPayroll, status: 'APPROVED' } as any)
    const res = await DELETE(new NextRequest('http://localhost/x', { method: 'DELETE' }), ctxPayment('pay-1', 'fee-1'))
    expect(res.status).toBe(400)
    expect(prisma.professionalFeePayment.delete).not.toHaveBeenCalled()
  })

  it('returns 404 when the payment does not belong to this payroll', async () => {
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue(draftPayroll as any)
    vi.mocked(prisma.professionalFeePayment.findUnique).mockResolvedValue({ id: 'fee-1', payrollId: 'OTHER-PAYROLL' } as any)
    const res = await DELETE(new NextRequest('http://localhost/x', { method: 'DELETE' }), ctxPayment('pay-1', 'fee-1'))
    expect(res.status).toBe(404)
    expect(prisma.professionalFeePayment.delete).not.toHaveBeenCalled()
  })

  it('deletes the payment, re-aggregates, and recomputes payroll totals', async () => {
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue(draftPayroll as any)
    vi.mocked(prisma.professionalFeePayment.findUnique).mockResolvedValue({ id: 'fee-1', payrollId: 'pay-1', amount: 2000, hiringCompany: 'A' } as any)
    vi.mocked(prisma.professionalFeePayment.aggregate).mockResolvedValue({ _sum: { amount: 0, taxWithheld: 0 } } as any)

    const res = await DELETE(new NextRequest('http://localhost/x', { method: 'DELETE' }), ctxPayment('pay-1', 'fee-1'))
    expect(res.status).toBe(200)
    expect(prisma.professionalFeePayment.delete).toHaveBeenCalledWith({ where: { id: 'fee-1' } })

    const updateArg = vi.mocked(prisma.payroll.update).mock.calls[0][0] as any
    expect(updateArg.data.professionalFee).toBe(0)
    expect(updateArg.data.professionalFeeTax).toBe(0)
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE' }))
  })
})
