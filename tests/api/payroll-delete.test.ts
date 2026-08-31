import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/ensure-payroll-payslip-columns', () => ({
  ensurePayrollPayslipColumns: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

vi.mock('@/lib/notifications', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/prisma', () => {
  const payroll = { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() }
  const salarySlip = { updateMany: vi.fn() }
  return {
    prisma: {
      payroll,
      salarySlip,
      $transaction: vi.fn(async (fn: (tx: { payroll: typeof payroll; salarySlip: typeof salarySlip }) => unknown) =>
        fn({ payroll, salarySlip }),
      ),
    },
  }
})

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/notifications'
import { DELETE } from '@/app/api/payroll/[id]/route'
import { POST as restorePost } from '@/app/api/payroll/[id]/restore/route'

const superAdminSession = { user: { id: 'super-1', name: 'Super', role: 'SUPER_ADMIN', branchId: null } }
const ceoSession = { user: { id: 'ceo-1', name: 'CEO', role: 'CEO', branchId: null } }
const hrSession = { user: { id: 'hr-1', name: 'HR', role: 'HR', branchId: null } }

function deleteReq() {
  return new NextRequest('http://localhost/api/payroll/pay-1', { method: 'DELETE' })
}
function restoreReq() {
  return new NextRequest('http://localhost/api/payroll/pay-1/restore', { method: 'POST' })
}
function ctx() {
  return { params: Promise.resolve({ id: 'pay-1' }) }
}

describe('DELETE /api/payroll/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('SUPER_ADMIN can soft-delete and an audit log is written', async () => {
    vi.mocked(auth).mockResolvedValue(superAdminSession as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({
      id: 'pay-1', userId: 'emp-1', deletedAt: null,
    } as any)
    vi.mocked(prisma.payroll.updateMany).mockResolvedValue({ count: 1 } as any)
    vi.mocked(prisma.salarySlip.updateMany).mockResolvedValue({ count: 1 } as any)

    const res = await DELETE(deleteReq(), ctx())
    expect(res.status).toBe(200)

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'super-1',
        targetId: 'emp-1',
        targetType: 'Payroll',
        action: 'DELETE',
        after: expect.objectContaining({ payrollId: 'pay-1' }),
      }),
    )
  })

  it('CEO can also soft-delete', async () => {
    vi.mocked(auth).mockResolvedValue(ceoSession as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({
      id: 'pay-1', userId: 'emp-1', deletedAt: null,
    } as any)
    vi.mocked(prisma.payroll.updateMany).mockResolvedValue({ count: 1 } as any)
    vi.mocked(prisma.salarySlip.updateMany).mockResolvedValue({ count: 1 } as any)

    const res = await DELETE(deleteReq(), ctx())
    expect(res.status).toBe(200)
  })

  it('HR cannot delete — 403, and the denied attempt is still audit-logged', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({ userId: 'emp-1' } as any)

    const res = await DELETE(deleteReq(), ctx())
    expect(res.status).toBe(403)
    expect(prisma.payroll.updateMany).not.toHaveBeenCalled()

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'hr-1',
        targetId: 'emp-1',
        targetType: 'Payroll',
        action: 'DELETE',
        after: expect.objectContaining({ payrollId: 'pay-1', forbidden: true, attemptedRole: 'HR' }),
      }),
    )
  })

  it('MANAGER_HR cannot delete either', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'mgr-1', role: 'MANAGER_HR', branchId: null } } as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({ userId: 'emp-1' } as any)

    const res = await DELETE(deleteReq(), ctx())
    expect(res.status).toBe(403)
  })

  it('soft-deletes the salary slip in the same transaction as the payroll', async () => {
    vi.mocked(auth).mockResolvedValue(superAdminSession as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({
      id: 'pay-1', userId: 'emp-1', deletedAt: null,
    } as any)
    vi.mocked(prisma.payroll.updateMany).mockResolvedValue({ count: 1 } as any)
    vi.mocked(prisma.salarySlip.updateMany).mockResolvedValue({ count: 1 } as any)

    await DELETE(deleteReq(), ctx())

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma.payroll.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pay-1', deletedAt: null },
        data: expect.objectContaining({ deletedById: 'super-1', deletedAt: expect.any(Date) }),
      }),
    )
    expect(prisma.salarySlip.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { payrollId: 'pay-1', deletedAt: null },
        data: expect.objectContaining({ deletedById: 'super-1', deletedAt: expect.any(Date) }),
      }),
    )
  })

  it('does not touch the salary slip when the payroll update matches 0 rows (already deleted)', async () => {
    vi.mocked(auth).mockResolvedValue(superAdminSession as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({
      id: 'pay-1', userId: 'emp-1', deletedAt: null,
    } as any)
    vi.mocked(prisma.payroll.updateMany).mockResolvedValue({ count: 0 } as any)

    const res = await DELETE(deleteReq(), ctx())
    expect(res.status).toBe(400)
    expect(prisma.salarySlip.updateMany).not.toHaveBeenCalled()
    expect(createAuditLog).not.toHaveBeenCalled()
  })

  it('rejects deleting an already-deleted payroll', async () => {
    vi.mocked(auth).mockResolvedValue(superAdminSession as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({
      id: 'pay-1', userId: 'emp-1', deletedAt: new Date('2026-08-01'),
    } as any)

    const res = await DELETE(deleteReq(), ctx())
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('รายการนี้ถูกลบไปแล้ว')
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('returns 404 for a payroll that does not exist', async () => {
    vi.mocked(auth).mockResolvedValue(superAdminSession as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue(null as any)

    const res = await DELETE(deleteReq(), ctx())
    expect(res.status).toBe(404)
  })
})

describe('POST /api/payroll/[id]/restore', () => {
  beforeEach(() => vi.clearAllMocks())

  it('SUPER_ADMIN can restore, and both payroll and salary slip are cleared in the same transaction', async () => {
    vi.mocked(auth).mockResolvedValue(superAdminSession as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({
      id: 'pay-1', userId: 'emp-1', deletedAt: new Date('2026-08-01'),
    } as any)

    const res = await restorePost(restoreReq(), ctx())
    expect(res.status).toBe(200)

    expect(prisma.payroll.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pay-1' },
        data: { deletedAt: null, deletedById: null },
      }),
    )
    expect(prisma.salarySlip.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { payrollId: 'pay-1' },
        data: { deletedAt: null, deletedById: null },
      }),
    )
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'super-1',
        targetId: 'emp-1',
        targetType: 'Payroll',
        action: 'UPDATE',
        after: expect.objectContaining({ payrollId: 'pay-1', deletedAt: null }),
      }),
    )
  })

  it('HR cannot restore — 403, denied attempt audit-logged', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({ userId: 'emp-1' } as any)

    const res = await restorePost(restoreReq(), ctx())
    expect(res.status).toBe(403)
    expect(prisma.payroll.update).not.toHaveBeenCalled()
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', after: expect.objectContaining({ restoreForbidden: true }) }),
    )
  })

  it('rejects restoring a payroll that is not deleted', async () => {
    vi.mocked(auth).mockResolvedValue(superAdminSession as any)
    vi.mocked(prisma.payroll.findUnique).mockResolvedValue({
      id: 'pay-1', userId: 'emp-1', deletedAt: null,
    } as any)

    const res = await restorePost(restoreReq(), ctx())
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('รายการนี้ไม่ได้ถูกลบ')
    expect(prisma.payroll.update).not.toHaveBeenCalled()
  })
})
