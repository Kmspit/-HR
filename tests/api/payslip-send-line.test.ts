import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/api-guard', () => ({
  requireCsrf: vi.fn().mockReturnValue(null),
}))

vi.mock('@/lib/access-control', () => ({
  canManagePayroll: vi.fn((role: string) => ['HR', 'MANAGER_HR', 'ADMIN', 'CEO'].includes(role)),
}))

vi.mock('@/lib/branch-scope', () => ({
  buildBranchScope: vi.fn((_user: unknown, params?: { branchId?: string }) => ({
    role: 'HR',
    filterBranchId: params?.branchId,
  })),
  branchNestedUserWhere: vi.fn((scope: { filterBranchId?: string }) =>
    scope.filterBranchId ? { branchId: scope.filterBranchId } : undefined,
  ),
  branchUserWhere: vi.fn((_scope: unknown, extra?: { id?: string }) => extra ?? {}),
}))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) =>
    new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

vi.mock('@/lib/ensure-payroll-payslip-columns', () => ({
  ensurePayrollPayslipColumns: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/line-credentials', () => ({
  resolveLineChannelAccessToken: vi.fn().mockResolvedValue({
    token: 'valid-token',
    source: 'env',
    tokenValid: true,
    tokenSourceDetail: 'env:LINE_CHANNEL_ACCESS_TOKEN',
  }),
}))

vi.mock('@/lib/notifications', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    payroll: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@/lib/payslip-pdf-service', () => ({
  buildPayrollSlipPdfBuffer: vi.fn().mockResolvedValue({
    buffer: Buffer.from('%PDF-mock'),
    filename: 'slip.pdf',
  }),
}))

vi.mock('@/lib/payslip-pdf-encrypt', () => ({
  nationalIdPdfPassword: vi.fn((id: string | null) => {
    const d = String(id ?? '').replace(/\D/g, '')
    return d.length >= 4 ? d.slice(-4) : null
  }),
  encryptPayslipPdfBuffer: vi.fn().mockResolvedValue(Buffer.from('%PDF-encrypted')),
}))

vi.mock('@/lib/payslip-pdf-access', () => ({
  appBaseUrl: vi.fn().mockReturnValue('https://app.example.com'),
  assertLineFlexUriLength: vi.fn().mockReturnValue(null),
  createPayslipPdfAccessToken: vi.fn().mockResolvedValue('access-token-abc'),
  payslipLinePdfUrl: vi.fn(
    (payrollId: string, base: string, token: string) =>
      `${base}/api/payslip/${payrollId}/line-pdf?access=${encodeURIComponent(token)}&download=1`,
  ),
}))

vi.mock('@/lib/cloudinary-service', () => ({
  isCloudinaryConfigured: vi.fn().mockReturnValue(true),
  loadUserImageContext: vi.fn().mockResolvedValue({
    userId: 'u1',
    employeeId: 'EMP001',
    branchId: null,
  }),
  payslipFolder: vi.fn().mockReturnValue('hr-system/payslips/EMP001/pay-1'),
  uploadAuthenticatedPdf: vi.fn().mockResolvedValue({
    publicId: 'hr-system/payslips/EMP001/pay-1/slip',
    secureUrl: 'https://res.cloudinary.com/demo/raw/authenticated/slip.pdf',
  }),
  deleteRawFile: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/line-api', () => ({
  pushLineMessages: vi.fn().mockResolvedValue({ ok: true }),
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveLineChannelAccessToken } from '@/lib/line-credentials'
import { POST } from '@/app/api/payslip/send-line/route'
import { sendPayslipViaLineForPayroll } from '@/lib/payslip-line-send'
import { encryptPayslipPdfBuffer } from '@/lib/payslip-pdf-encrypt'
import { pushLineMessages } from '@/lib/line-api'
import { buildPayrollSlipPdfBuffer } from '@/lib/payslip-pdf-service'
import { uploadAuthenticatedPdf } from '@/lib/cloudinary-service'
import { createPayslipPdfAccessToken } from '@/lib/payslip-pdf-access'
import { createAuditLog } from '@/lib/notifications'

const hrSession = { user: { id: 'hr-1', name: 'HR', role: 'HR', branchId: null } }

function makePostReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/payslip/send-line', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const approvedPayrollUser = {
  id: 'pay-1',
  userId: 'u1',
  month: 6,
  year: 2026,
  status: 'APPROVED',
  baseSalary: 30000,
  lateDeduction: 0,
  absentDeduction: 0,
  unpaidLeave: 0,
  socialSecurity: 750,
  taxDeduction: 0,
  otherDeduction: 0,
  otherAddition: 0,
  netSalary: 29250,
  lateDays: 0,
  absentDays: 0,
  lateMinutes: 0,
  lateBillableMinutes: 0,
  taxDetail: null,
  user: {
    id: 'u1',
    name: 'Test User',
    employeeId: 'EMP001',
    department: 'HR',
    position: 'Staff',
    branchId: null,
    nationalId: '1234567890123',
    lineUserId: 'U12345678901234567890123456789012',
  },
}

describe('POST /api/payslip/send-line', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'u1' } as never)
    vi.mocked(prisma.payroll.updateMany).mockResolvedValue({ count: 1 } as never)
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const res = await POST(makePostReq({ payrollId: 'pay-1' }))
    expect(res.status).toBe(401)
  })

  it('returns 403 for non-payroll role', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'e1', role: 'EMPLOYEE' } } as never)
    const res = await POST(makePostReq({ payrollId: 'pay-1' }))
    expect(res.status).toBe(403)
  })

  it('returns 503 when LINE token missing', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    vi.mocked(resolveLineChannelAccessToken).mockResolvedValueOnce({
      source: 'none',
      tokenValid: false,
    })
    const res = await POST(makePostReq({ payrollId: 'pay-1' }))
    expect(res.status).toBe(503)
    const data = await res.json()
    expect(data.error).toContain('LINE Channel Access Token')
  })

  it('returns 403 when anchor payroll out of branch scope', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({
      id: 'pay-1',
      month: 6,
      year: 2026,
      userId: 'u1',
    } as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null as never)

    const res = await POST(makePostReq({ payrollId: 'pay-1', branchId: 'branch-a' }))
    expect(res.status).toBe(403)
  })

  it('sends single employee with proxy download URL in flex', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.payroll.findUnique)
      .mockResolvedValueOnce({ id: 'pay-1', month: 6, year: 2026, userId: 'u1' } as never)
      .mockResolvedValueOnce(approvedPayrollUser as never)
      .mockResolvedValueOnce(approvedPayrollUser as never)
    vi.mocked(prisma.payroll.findMany).mockResolvedValue([{ id: 'pay-1', userId: 'u1' }] as never)
    vi.mocked(prisma.payroll.update).mockResolvedValue({} as never)

    const res = await POST(makePostReq({ payrollId: 'pay-1', userId: 'u1' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.sent).toBe(1)
    expect(uploadAuthenticatedPdf).toHaveBeenCalled()
    expect(createPayslipPdfAccessToken).toHaveBeenCalledWith('pay-1', expect.any(String))
    expect(pushLineMessages).toHaveBeenCalledWith(
      'U12345678901234567890123456789012',
      expect.arrayContaining([
        expect.objectContaining({
          type: 'flex',
          contents: expect.objectContaining({
            footer: expect.objectContaining({
              contents: expect.arrayContaining([
                expect.objectContaining({
                  action: expect.objectContaining({
                    uri: expect.stringContaining('/api/payslip/pay-1/line-pdf'),
                  }),
                }),
              ]),
            }),
          }),
        }),
      ]),
    )
    expect(createAuditLog).toHaveBeenCalled()
  })

  it('batch skips employees without lineUserId in query', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({
      id: 'pay-1',
      month: 6,
      year: 2026,
      userId: 'u1',
    } as never)
    vi.mocked(prisma.payroll.findMany).mockResolvedValue([{ id: 'pay-1', userId: 'u1' }] as never)

    vi.mocked(prisma.payroll.findUnique)
      .mockResolvedValueOnce({ id: 'pay-1', month: 6, year: 2026, userId: 'u1' } as never)
      .mockResolvedValueOnce(approvedPayrollUser as never)
      .mockResolvedValueOnce(approvedPayrollUser as never)

    vi.mocked(prisma.payroll.update).mockResolvedValue({} as never)

    await POST(makePostReq({ payrollId: 'pay-1', branchId: 'branch-a' }))

    expect(prisma.payroll.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          user: expect.objectContaining({ lineUserId: { not: null } }),
        }),
      }),
    )
  })
})

describe('sendPayslipViaLineForPayroll', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.payroll.updateMany).mockResolvedValue({ count: 1 } as never)
  })

  it('fails gracefully when user has no lineUserId', async () => {
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({
      id: 'pay-1',
      userId: 'u1',
      month: 6,
      year: 2026,
      status: 'APPROVED',
      user: {
        id: 'u1',
        name: 'Test User',
        nationalId: '1234567890123',
        lineUserId: null,
      },
    } as never)
    vi.mocked(prisma.payroll.update).mockResolvedValue({} as never)

    const result = await sendPayslipViaLineForPayroll('pay-1')

    expect(result.ok).toBe(false)
    expect(result.error).toContain('LINE OA')
    expect(prisma.payroll.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pay-1' },
        data: expect.objectContaining({
          payslipSentStatus: 'FAILED',
          payslipSentVia: null,
        }),
      }),
    )
  })

  it('blocks concurrent send when lock not acquired', async () => {
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({
      id: 'pay-1',
      userId: 'u1',
      month: 6,
      year: 2026,
      status: 'APPROVED',
      user: {
        id: 'u1',
        name: 'Test User',
        nationalId: '1234567890123',
        lineUserId: 'U12345678901234567890123456789012',
      },
    } as never)
    vi.mocked(prisma.payroll.updateMany).mockResolvedValue({ count: 0 } as never)

    const result = await sendPayslipViaLineForPayroll('pay-1')

    expect(result.ok).toBe(false)
    expect(result.error).toContain('กำลังส่ง')
    expect(buildPayrollSlipPdfBuffer).not.toHaveBeenCalled()
  })

  it('records SUCCESS status in DB', async () => {
    vi.mocked(prisma.payroll.findUnique)
      .mockResolvedValueOnce({
        id: 'pay-1',
        userId: 'u1',
        month: 6,
        year: 2026,
        status: 'APPROVED',
        user: {
          id: 'u1',
          name: 'Test User',
          nationalId: '1234567890123',
          lineUserId: 'U12345678901234567890123456789012',
        },
      } as never)
      .mockResolvedValueOnce(approvedPayrollUser as never)
    vi.mocked(prisma.payroll.update).mockResolvedValue({} as never)

    const result = await sendPayslipViaLineForPayroll('pay-1')

    expect(result.ok).toBe(true)
    expect(encryptPayslipPdfBuffer).toHaveBeenCalledWith(expect.any(Buffer), '0123')
    expect(prisma.payroll.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pay-1' },
        data: expect.objectContaining({
          payslipSentStatus: 'SUCCESS',
          payslipSentVia: 'LINE',
        }),
      }),
    )
  })
})
