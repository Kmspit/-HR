import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  notifyRole: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/org-scope', () => ({
  canApproverActOnRequester: vi.fn().mockResolvedValue(true),
}))

import { executeWeeklyPlanStepAction } from '@/lib/weekly-plan-chain'
import { notifyRole } from '@/lib/notifications'

describe('executeWeeklyPlanStepAction — CEO/SUPER_ADMIN override survives a corrupted currentStepOrder (Phase D)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('MANAGER gets 400 when currentStepOrder does not point at a PENDING step (no rescue for non-override roles)', async () => {
    const prisma = {
      weeklyLawyerPlan: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'p1', status: 'PENDING', chainConfigId: 'c1', currentStepOrder: 1, lawyerId: 'lawyer-1',
        }),
        update: vi.fn(),
      },
      weeklyPlanApprovalStep: {
        findFirst: vi.fn().mockResolvedValueOnce(null), // stepOrder:1 lookup -> corrupted, nothing PENDING there
        updateMany: vi.fn(),
      },
    } as never

    const result = await executeWeeklyPlanStepAction(prisma, 'p1', 'mgr-1', 'MANAGER', 'APPROVE', undefined, '1.2.3.4')

    expect(result).toEqual({ error: 'ไม่พบขั้นตอนที่รออนุมัติ', status: 400 })
  })

  it('CEO falls back to the real next PENDING step, realigns currentStepOrder, and notifies CEO/SUPER_ADMIN of the inconsistency', async () => {
    const stepUpdateMany = vi.fn().mockResolvedValue({ count: 1 })
    const planUpdate = vi.fn().mockResolvedValue({})
    const prisma = {
      weeklyLawyerPlan: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: 'p1', status: 'PENDING', chainConfigId: 'c1', currentStepOrder: 1, lawyerId: 'lawyer-1' })
          .mockResolvedValueOnce({ currentStepOrder: 2, chainConfigId: 'c1', lawyerId: 'lawyer-1' }), // re-read inside advanceWeeklyPlanChain, after realignment
        update: planUpdate,
      },
      weeklyPlanApprovalStep: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null) // stepOrder:1 + PENDING -> not found (corrupted)
          .mockResolvedValueOnce({ id: 'step-2', stepOrder: 2, stepName: 'ผู้บริหาร', approverId: null, approverRole: 'CEO' }) // fallback: any PENDING
          .mockResolvedValueOnce(null), // advanceWeeklyPlanChain: no step beyond 2 -> finalize
        updateMany: stepUpdateMany,
      },
    } as never

    const result = await executeWeeklyPlanStepAction(prisma, 'p1', 'ceo-1', 'CEO', 'APPROVE', undefined, '1.2.3.4')

    expect(result).toEqual(expect.objectContaining({ success: true, finalized: true, stepName: 'ผู้บริหาร' }))
    expect(stepUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'step-2', stepOrder: 2, status: 'PENDING' }) }),
    )
    // Pointer realigned to the step actually claimed, not left at the stale value.
    expect(planUpdate).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { currentStepOrder: 2 } })
    expect(notifyRole).toHaveBeenCalledWith('CEO', 'SYSTEM', expect.any(String), expect.any(String), '/approval-center')
    expect(notifyRole).toHaveBeenCalledWith('SUPER_ADMIN', 'SYSTEM', expect.any(String), expect.any(String), '/approval-center')
  })

  it('CEO still gets 400 when there is truly no PENDING step left for the plan', async () => {
    const prisma = {
      weeklyLawyerPlan: {
        findUnique: vi.fn().mockResolvedValue({ id: 'p1', status: 'PENDING', chainConfigId: 'c1', currentStepOrder: 1, lawyerId: 'lawyer-1' }),
        update: vi.fn(),
      },
      weeklyPlanApprovalStep: {
        findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null), // corrupted, and no fallback PENDING step exists either
        updateMany: vi.fn(),
      },
    } as never

    const result = await executeWeeklyPlanStepAction(prisma, 'p1', 'ceo-1', 'CEO', 'APPROVE', undefined, '1.2.3.4')

    expect(result).toEqual({ error: 'ไม่พบขั้นตอนที่รออนุมัติ', status: 400 })
  })

  it('normal (uncorrupted) path is unaffected — no realignment write, no notification', async () => {
    const stepUpdateMany = vi.fn().mockResolvedValue({ count: 1 })
    const planUpdate = vi.fn().mockResolvedValue({})
    const prisma = {
      weeklyLawyerPlan: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: 'p1', status: 'PENDING', chainConfigId: 'c1', currentStepOrder: 1, lawyerId: 'lawyer-1' })
          .mockResolvedValueOnce({ currentStepOrder: 1, chainConfigId: 'c1', lawyerId: 'lawyer-1' }),
        update: planUpdate,
      },
      weeklyPlanApprovalStep: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: 'step-1', stepOrder: 1, stepName: 'หัวหน้าทีม', approverId: 'tl-1', approverRole: null })
          .mockResolvedValueOnce(null), // advanceWeeklyPlanChain: no step beyond 1 -> finalize
        updateMany: stepUpdateMany,
      },
    } as never

    const result = await executeWeeklyPlanStepAction(prisma, 'p1', 'tl-1', 'TEAM_LEADER', 'APPROVE', undefined, '1.2.3.4')

    expect(result).toEqual(expect.objectContaining({ success: true, finalized: true }))
    expect(planUpdate).not.toHaveBeenCalledWith({ where: { id: 'p1' }, data: { currentStepOrder: 1 } })
    expect(notifyRole).not.toHaveBeenCalled()
  })
})
