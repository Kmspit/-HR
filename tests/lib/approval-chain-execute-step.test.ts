import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  notifyRole: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/org-scope', () => ({
  canApproverActOnRequester: vi.fn().mockResolvedValue(true),
}))

import { executeLeaveStepAction, executeOutsideWorkStepAction } from '@/lib/approval-chain'
import { executeForgotScanStepAction } from '@/lib/forgot-scan-chain'
import { notifyRole } from '@/lib/notifications'

describe('executeLeaveStepAction — CEO/SUPER_ADMIN override survives a corrupted currentStepOrder', () => {
  beforeEach(() => vi.clearAllMocks())

  it('MANAGER gets 400 when currentStepOrder does not point at a PENDING step (no rescue for non-override roles)', async () => {
    const prisma = {
      leaveRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'l1', status: 'PENDING', chainConfigId: 'c1', currentStepOrder: 1, userId: 'emp-1',
        }),
        update: vi.fn(),
      },
      leaveApprovalStep: {
        findFirst: vi.fn().mockResolvedValueOnce(null), // stepOrder:1 lookup -> corrupted, nothing PENDING there
        updateMany: vi.fn(),
      },
    } as never

    const result = await executeLeaveStepAction(prisma, 'l1', 'mgr-1', 'MANAGER', 'APPROVE', undefined, '1.2.3.4')

    expect(result).toEqual({ error: 'ไม่พบขั้นตอนที่รออนุมัติ', status: 400 })
  })

  it('CEO falls back to the real next PENDING step, realigns currentStepOrder, and notifies CEO/SUPER_ADMIN of the inconsistency', async () => {
    const stepUpdateMany = vi.fn().mockResolvedValue({ count: 1 })
    const leaveUpdate = vi.fn().mockResolvedValue({})
    const prisma = {
      leaveRequest: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: 'l1', status: 'PENDING', chainConfigId: 'c1', currentStepOrder: 1, userId: 'emp-1' })
          .mockResolvedValueOnce({ currentStepOrder: 2, chainConfigId: 'c1', userId: 'emp-1' }), // re-read inside advanceLeaveChain, after realignment
        update: leaveUpdate,
      },
      leaveApprovalStep: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null) // stepOrder:1 + PENDING -> not found (corrupted)
          .mockResolvedValueOnce({ id: 'step-2', stepOrder: 2, stepName: 'HR', approverId: null, approverRole: 'HR' }) // fallback: any PENDING
          .mockResolvedValueOnce(null), // advanceLeaveChain: no step beyond 2 -> finalize
        updateMany: stepUpdateMany,
      },
    } as never

    const result = await executeLeaveStepAction(prisma, 'l1', 'ceo-1', 'CEO', 'APPROVE', undefined, '1.2.3.4')

    expect(result).toEqual(expect.objectContaining({ success: true, finalized: true, stepName: 'HR' }))
    expect(stepUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'step-2', stepOrder: 2, status: 'PENDING' }) }),
    )
    // Pointer realigned to the step actually claimed, not left at the stale value.
    expect(leaveUpdate).toHaveBeenCalledWith({ where: { id: 'l1' }, data: { currentStepOrder: 2 } })
    expect(notifyRole).toHaveBeenCalledWith('CEO', 'SYSTEM', expect.any(String), expect.any(String), '/approval-center')
    expect(notifyRole).toHaveBeenCalledWith('SUPER_ADMIN', 'SYSTEM', expect.any(String), expect.any(String), '/approval-center')
  })

  it('CEO still gets 400 when there is truly no PENDING step left for the request', async () => {
    const prisma = {
      leaveRequest: {
        findUnique: vi.fn().mockResolvedValue({ id: 'l1', status: 'PENDING', chainConfigId: 'c1', currentStepOrder: 1, userId: 'emp-1' }),
        update: vi.fn(),
      },
      leaveApprovalStep: {
        findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null), // corrupted, and no fallback PENDING step exists either
        updateMany: vi.fn(),
      },
    } as never

    const result = await executeLeaveStepAction(prisma, 'l1', 'ceo-1', 'CEO', 'APPROVE', undefined, '1.2.3.4')

    expect(result).toEqual({ error: 'ไม่พบขั้นตอนที่รออนุมัติ', status: 400 })
  })

  it('normal (uncorrupted) path is unaffected — no realignment write, no notification', async () => {
    const stepUpdateMany = vi.fn().mockResolvedValue({ count: 1 })
    const leaveUpdate = vi.fn().mockResolvedValue({})
    const prisma = {
      leaveRequest: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: 'l1', status: 'PENDING', chainConfigId: 'c1', currentStepOrder: 1, userId: 'emp-1' })
          .mockResolvedValueOnce({ currentStepOrder: 1, chainConfigId: 'c1', userId: 'emp-1' }),
        update: leaveUpdate,
      },
      leaveApprovalStep: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: 'step-1', stepOrder: 1, stepName: 'หัวหน้า', approverId: 'mgr-1', approverRole: null })
          .mockResolvedValueOnce(null), // advanceLeaveChain: no next -> finalize
        updateMany: stepUpdateMany,
      },
    } as never

    const result = await executeLeaveStepAction(prisma, 'l1', 'mgr-1', 'MANAGER', 'APPROVE', undefined, '1.2.3.4')

    expect(result).toEqual(expect.objectContaining({ success: true, finalized: true }))
    expect(leaveUpdate).not.toHaveBeenCalledWith({ where: { id: 'l1' }, data: { currentStepOrder: 1 } })
    expect(notifyRole).not.toHaveBeenCalled()
  })
})

describe('executeOutsideWorkStepAction — same CEO/SUPER_ADMIN override fallback', () => {
  beforeEach(() => vi.clearAllMocks())

  it('CEO rescues a request whose currentStepOrder is stale', async () => {
    const stepUpdateMany = vi.fn().mockResolvedValue({ count: 1 })
    const requestUpdate = vi.fn().mockResolvedValue({})
    const prisma = {
      outsideWorkRequest: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: 'ow1', status: 'PENDING', chainConfigId: 'c1', currentStepOrder: 1, userId: 'emp-1' })
          .mockResolvedValueOnce({ currentStepOrder: 2, chainConfigId: 'c1', userId: 'emp-1' }),
        update: requestUpdate,
      },
      outsideWorkApprovalStep: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'step-2', stepOrder: 2, stepName: 'HR', approverId: null, approverRole: 'HR' })
          .mockResolvedValueOnce(null),
        updateMany: stepUpdateMany,
      },
    } as never

    const result = await executeOutsideWorkStepAction(prisma, 'ow1', 'ceo-1', 'CEO', 'APPROVE', undefined, '1.2.3.4')

    expect(result).toEqual(expect.objectContaining({ success: true, finalized: true }))
    expect(requestUpdate).toHaveBeenCalledWith({ where: { id: 'ow1' }, data: { currentStepOrder: 2 } })
    expect(notifyRole).toHaveBeenCalled()
  })

  it('MANAGER gets 400 for the same corrupted state (no rescue)', async () => {
    const prisma = {
      outsideWorkRequest: {
        findUnique: vi.fn().mockResolvedValue({ id: 'ow1', status: 'PENDING', chainConfigId: 'c1', currentStepOrder: 1, userId: 'emp-1' }),
        update: vi.fn(),
      },
      outsideWorkApprovalStep: {
        findFirst: vi.fn().mockResolvedValueOnce(null),
        updateMany: vi.fn(),
      },
    } as never

    const result = await executeOutsideWorkStepAction(prisma, 'ow1', 'mgr-1', 'MANAGER', 'APPROVE', undefined, '1.2.3.4')

    expect(result).toEqual({ error: 'ไม่พบขั้นตอนที่รออนุมัติ', status: 400 })
  })
})

describe('executeForgotScanStepAction — same CEO/SUPER_ADMIN override fallback', () => {
  beforeEach(() => vi.clearAllMocks())

  it('CEO rescues a request whose currentStepOrder is stale', async () => {
    const stepUpdateMany = vi.fn().mockResolvedValue({ count: 1 })
    const requestUpdate = vi.fn().mockResolvedValue({})
    const prisma = {
      forgotScanRequest: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            id: 'fs1', status: 'PENDING', chainConfigId: 'c1', currentStepOrder: 1, userId: 'emp-1', scanType: 'checkin',
          })
          .mockResolvedValueOnce({ currentStepOrder: 2, chainConfigId: 'c1', userId: 'emp-1', scanType: 'checkin' })
          // Re-fetched inside applyToAttendance (called from finalizeForgotScanApproval).
          .mockResolvedValueOnce({
            id: 'fs1', scanType: 'checkin', correctTime: new Date('2026-07-08T09:00:00Z'), userId: 'emp-1', hrId: null,
          }),
        update: requestUpdate,
      },
      forgotScanApprovalStep: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'step-2', stepOrder: 2, stepName: 'HR', approverId: null, approverRole: 'HR' })
          .mockResolvedValueOnce(null),
        updateMany: stepUpdateMany,
      },
      attendance: {
        findFirst: vi.fn().mockResolvedValue({ id: 'att-1', checkIn: null }),
        update: vi.fn().mockResolvedValue({}),
        create: vi.fn(),
      },
    } as never

    const result = await executeForgotScanStepAction(prisma, 'fs1', 'ceo-1', 'CEO', 'APPROVE', undefined, '1.2.3.4')

    expect(result).toEqual(expect.objectContaining({ success: true, finalized: true }))
    expect(requestUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'fs1' }, data: expect.objectContaining({ currentStepOrder: 2 }) }),
    )
    expect(notifyRole).toHaveBeenCalled()
  })

  it('HR gets 400 for the same corrupted state (no rescue)', async () => {
    const prisma = {
      forgotScanRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'fs1', status: 'PENDING', chainConfigId: 'c1', currentStepOrder: 1, userId: 'emp-1', scanType: 'checkin',
        }),
        update: vi.fn(),
      },
      forgotScanApprovalStep: {
        findFirst: vi.fn().mockResolvedValueOnce(null),
        updateMany: vi.fn(),
      },
    } as never

    const result = await executeForgotScanStepAction(prisma, 'fs1', 'hr-1', 'HR', 'APPROVE', undefined, '1.2.3.4')

    expect(result).toEqual({ error: 'ไม่พบขั้นตอนที่รออนุมัติ', status: 400 })
  })
})
