import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    payroll: { findUnique: vi.fn() },
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
}))

vi.mock('@/lib/branch-scope', () => ({
  buildBranchScope: vi.fn().mockReturnValue({}),
  branchUserWhere: vi.fn((_scope: unknown, extra?: Record<string, unknown>) => extra ?? {}),
}))

vi.mock('@/lib/company-settings-cache', () => ({
  getCachedCompanySettings: vi.fn().mockResolvedValue({ companyName: 'Test Co' }),
}))

vi.mock('@/lib/payroll-pdf', () => ({
  generateSalarySlipPdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-mock')),
}))

vi.mock('@/lib/payroll-tax', () => ({
  parseTaxDetail: vi.fn().mockReturnValue(null),
}))

vi.mock('@/lib/payslip-pdf-access', () => ({
  verifyPayslipPdfAccessToken: vi.fn(),
}))

vi.mock('@/lib/cloudinary-service', () => ({
  fetchRawPdfBuffer: vi.fn(),
}))

vi.mock('@/lib/payslip-cloudinary-path', () => ({
  payslipPdfFilename: vi.fn().mockReturnValue('slip.pdf'),
  resolvePayslipPdfPublicId: vi.fn().mockResolvedValue('public-id'),
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { verifyPayslipPdfAccessToken } from '@/lib/payslip-pdf-access'
import { fetchRawPdfBuffer } from '@/lib/cloudinary-service'
import { GET as pdfGet } from '@/app/api/payslip/[id]/pdf/route'
import { GET as linePdfGet } from '@/app/api/payslip/[id]/line-pdf/route'

const hrSession = { user: { id: 'hr-1', name: 'HR', role: 'HR', branchId: null } }

function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

const deletedPayroll = {
  id: 'pay-1', userId: 'emp-1', month: 1, year: 2025, status: 'APPROVED',
  deletedAt: new Date('2026-08-01'),
  user: { name: 'A', employeeId: 'E1', department: 'IT', position: 'Dev', branchId: null },
}

describe('GET /api/payslip/[id]/pdf', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 404 for a soft-deleted payroll', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue(deletedPayroll as any)

    const res = await pdfGet(new NextRequest('http://localhost/api/payslip/pay-1/pdf'), ctx('pay-1'))
    expect(res.status).toBe(404)
  })
})

describe('GET /api/payslip/[id]/line-pdf', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 410 with the cancelled-slip message for a soft-deleted payroll', async () => {
    vi.mocked(verifyPayslipPdfAccessToken).mockResolvedValue(true as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({
      month: 1, year: 2025, status: 'APPROVED', userId: 'emp-1',
      payslipCloudinaryPublicId: 'pub-1', deletedAt: new Date('2026-08-01'),
      user: { employeeId: 'E1' },
    } as any)

    const res = await linePdfGet(
      new NextRequest('http://localhost/api/payslip/pay-1/line-pdf?access=tok'),
      ctx('pay-1'),
    )
    expect(res.status).toBe(410)
    const data = await res.json()
    expect(data.error).toBe('สลิปถูกยกเลิก กรุณาติดต่อ HR')
    expect(fetchRawPdfBuffer).not.toHaveBeenCalled()
  })
})
