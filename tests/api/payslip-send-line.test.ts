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
  buildBranchScope: vi.fn().mockReturnValue({}),
  branchNestedUserWhere: vi.fn().mockReturnValue({}),
}))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) =>
    new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

vi.mock('@/lib/ensure-payroll-payslip-columns', () => ({
  ensurePayrollPayslipColumns: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    payroll: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    companySettings: {
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

vi.mock('@/lib/line-file-upload', () => ({
  uploadLineMessageContent: vi.fn().mockResolvedValue({ ok: true, messageId: 'msg-1' }),
}))

vi.mock('@/lib/line-api', () => ({
  pushLineMessages: vi.fn().mockResolvedValue({ ok: true }),
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { POST } from '@/app/api/payslip/send-line/route'
import { sendPayslipViaLineForPayroll } from '@/lib/payslip-line-send'
import { encryptPayslipPdfBuffer } from '@/lib/payslip-pdf-encrypt'
import { pushLineMessages } from '@/lib/line-api'
import { buildPayrollSlipPdfBuffer } from '@/lib/payslip-pdf-service'

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
  beforeEach(() => vi.clearAllMocks())

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

  it('returns 404 when anchor payroll not found', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue(null as never)
    const res = await POST(makePostReq({ payrollId: 'missing' }))
    expect(res.status).toBe(404)
  })

  it('sends single employee when userId provided', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.payroll.findUnique)
      .mockResolvedValueOnce({ id: 'pay-1', month: 6, year: 2026 } as never)
      .mockResolvedValueOnce(approvedPayrollUser as never)
      .mockResolvedValueOnce(approvedPayrollUser as never)
    vi.mocked(prisma.payroll.findMany).mockResolvedValue([{ id: 'pay-1', userId: 'u1' }] as never)
    vi.mocked(prisma.payroll.update).mockResolvedValue({} as never)

    const res = await POST(makePostReq({ payrollId: 'pay-1', userId: 'u1' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.sent).toBe(1)
    expect(data.failed).toBe(0)
    expect(buildPayrollSlipPdfBuffer).toHaveBeenCalled()
    expect(encryptPayslipPdfBuffer).toHaveBeenCalledWith(expect.any(Buffer), '0123')
    expect(pushLineMessages).toHaveBeenCalled()
  })

  it('sends batch when userId omitted', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({
      id: 'pay-1',
      month: 6,
      year: 2026,
    } as never)
    vi.mocked(prisma.payroll.findMany).mockResolvedValue([
      { id: 'pay-1', userId: 'u1' },
      { id: 'pay-2', userId: 'u2' },
    ] as never)

    vi.mocked(prisma.payroll.findUnique)
      .mockResolvedValueOnce({ id: 'pay-1', month: 6, year: 2026 } as never)
      .mockResolvedValueOnce({
        ...approvedPayrollUser,
        id: 'pay-1',
      } as never)
      .mockResolvedValueOnce({
        ...approvedPayrollUser,
        id: 'pay-1',
      } as never)
      .mockResolvedValueOnce({
        ...approvedPayrollUser,
        id: 'pay-2',
        user: { ...approvedPayrollUser.user, lineUserId: null },
      } as never)

    vi.mocked(prisma.payroll.update).mockResolvedValue({} as never)

    const res = await POST(makePostReq({ payrollId: 'pay-1' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.sent).toBe(1)
    expect(data.failed).toBe(1)
    expect(data.success).toBe(false)
  })
})

describe('sendPayslipViaLineForPayroll', () => {
  beforeEach(() => vi.clearAllMocks())

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
        data: expect.objectContaining({ payslipSentStatus: 'FAILED' }),
      }),
    )
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
