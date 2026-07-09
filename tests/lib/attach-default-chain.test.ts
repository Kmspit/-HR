import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────
// attachDefaultChainForOutside delegates entirely to applyChainToOutsideWork
// for setting status/approvalStatus — mock the chain-application functions so
// we can assert the wrapper does NOT perform any extra write of its own.

const applyChainToOutsideWork = vi.fn().mockResolvedValue(undefined)
const applyChainToLeave = vi.fn().mockResolvedValue(undefined)
const getDefaultChain = vi.fn()
vi.mock('@/lib/approval-chain', () => ({
  getDefaultChain: (...a: unknown[]) => getDefaultChain(...a),
  applyChainToOutsideWork: (...a: unknown[]) => applyChainToOutsideWork(...a),
  applyChainToLeave: (...a: unknown[]) => applyChainToLeave(...a),
}))

const applyChainToForgotScan = vi.fn().mockResolvedValue(undefined)
const applyToAttendance = vi.fn().mockResolvedValue(true)
vi.mock('@/lib/weekly-plan-chain', () => ({ applyChainToWeeklyPlan: vi.fn() }))
vi.mock('@/lib/forgot-scan-chain', () => ({
  applyChainToForgotScan: (...a: unknown[]) => applyChainToForgotScan(...a),
  applyToAttendance: (...a: unknown[]) => applyToAttendance(...a),
  APPLY_ATTENDANCE_FAILED_MSG: 'ไม่สามารถ apply เวลาได้ — ไม่พบ attendance record ของวันนี้',
}))

import { attachDefaultChainForOutside, attachAllPendingDefaultChains } from '@/lib/attach-default-chain'

function makeFakePrisma(overrides: { chainConfigId?: string | null } = {}) {
  const update = vi.fn().mockResolvedValue({ id: 'req-1' })
  return {
    prisma: {
      outsideWorkRequest: {
        findUnique: vi.fn().mockResolvedValue({ chainConfigId: overrides.chainConfigId ?? null }),
        update,
      },
    } as never,
    update,
  }
}

describe('attachDefaultChainForOutside — does not clobber approvalStatus after applyChainToOutsideWork', () => {
  beforeEach(() => vi.clearAllMocks())

  it('never writes approvalStatus itself — delegates entirely to applyChainToOutsideWork (auto-finalized APPROVED case stays APPROVED)', async () => {
    getDefaultChain.mockResolvedValue({ id: 'chain-1' })
    const { prisma, update } = makeFakePrisma()

    const attached = await attachDefaultChainForOutside(prisma, 'req-1', 'user-1')

    expect(attached).toBe(true)
    expect(applyChainToOutsideWork).toHaveBeenCalledWith(prisma, 'req-1', 'chain-1', 'user-1')
    // The regression: this used to always fire a second update forcing
    // approvalStatus back to 'pending_chain', even when applyChainToOutsideWork
    // had just finalized the request to APPROVED. There must be none now.
    expect(update).not.toHaveBeenCalled()
  })

  it('returns false without calling applyChainToOutsideWork when the request already has a chain', async () => {
    getDefaultChain.mockResolvedValue({ id: 'chain-1' })
    const { prisma, update } = makeFakePrisma({ chainConfigId: 'already-has-one' })

    const attached = await attachDefaultChainForOutside(prisma, 'req-1', 'user-1')

    expect(attached).toBe(false)
    expect(applyChainToOutsideWork).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('returns false without side effects when no default OUTSIDE_WORK chain is configured', async () => {
    getDefaultChain.mockResolvedValue(null)
    const { prisma, update } = makeFakePrisma()

    const attached = await attachDefaultChainForOutside(prisma, 'req-1', 'user-1')

    expect(attached).toBe(false)
    expect(applyChainToOutsideWork).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })
})

describe('attachAllPendingDefaultChains — legacy ADMIN_APPROVED migration no longer strands the request', () => {
  beforeEach(() => vi.clearAllMocks())

  it('LEAVE: finalizes to APPROVED (not re-pending at the just-approved step) when the auto-approved step was the last pending one', async () => {
    getDefaultChain.mockImplementation((_p: unknown, type: string) =>
      Promise.resolve(type === 'LEAVE' ? { id: 'leave-chain' } : null),
    )
    const leaveRequestUpdate = vi.fn().mockResolvedValue({})
    const prisma = {
      leaveRequest: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([]) // PENDING rows
          .mockResolvedValueOnce([{ id: 'leave-1', userId: 'user-1' }]), // ADMIN_APPROVED rows
        update: leaveRequestUpdate,
      },
      leaveApprovalStep: {
        findMany: vi.fn().mockResolvedValue([{ id: 'step-1', stepOrder: 1, status: 'PENDING' }]),
        update: vi.fn().mockResolvedValue({}),
      },
      outsideWorkRequest: { findMany: vi.fn().mockResolvedValue([]) },
      weeklyLawyerPlan: { findMany: vi.fn().mockResolvedValue([]) },
      forgotScanRequest: { findMany: vi.fn().mockResolvedValue([]) },
    } as never

    await attachAllPendingDefaultChains(prisma)

    expect(leaveRequestUpdate).toHaveBeenCalledWith({
      where: { id: 'leave-1' },
      data: { currentStepOrder: 0, status: 'APPROVED' },
    })
  })

  it('LEAVE: still advances to the next step normally when one remains pending', async () => {
    getDefaultChain.mockImplementation((_p: unknown, type: string) =>
      Promise.resolve(type === 'LEAVE' ? { id: 'leave-chain' } : null),
    )
    const leaveRequestUpdate = vi.fn().mockResolvedValue({})
    const prisma = {
      leaveRequest: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ id: 'leave-1', userId: 'user-1' }]),
        update: leaveRequestUpdate,
      },
      leaveApprovalStep: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'step-1', stepOrder: 1, status: 'PENDING' },
          { id: 'step-2', stepOrder: 2, status: 'PENDING' },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
      outsideWorkRequest: { findMany: vi.fn().mockResolvedValue([]) },
      weeklyLawyerPlan: { findMany: vi.fn().mockResolvedValue([]) },
      forgotScanRequest: { findMany: vi.fn().mockResolvedValue([]) },
    } as never

    await attachAllPendingDefaultChains(prisma)

    expect(leaveRequestUpdate).toHaveBeenCalledWith({
      where: { id: 'leave-1' },
      data: { currentStepOrder: 2, status: 'PENDING' },
    })
  })

  it('FORGOT_SCAN: finalizes to APPROVED and applies the attendance correction when the auto-approved step was the last one', async () => {
    getDefaultChain.mockImplementation((_p: unknown, type: string) =>
      Promise.resolve(type === 'FORGOT_SCAN' ? { id: 'fs-chain' } : null),
    )
    applyToAttendance.mockResolvedValueOnce(true)
    const forgotScanUpdate = vi.fn().mockResolvedValue({})
    const prisma = {
      leaveRequest: { findMany: vi.fn().mockResolvedValue([]) },
      outsideWorkRequest: { findMany: vi.fn().mockResolvedValue([]) },
      weeklyLawyerPlan: { findMany: vi.fn().mockResolvedValue([]) },
      forgotScanRequest: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ id: 'fs-1', userId: 'user-1' }]),
        update: forgotScanUpdate,
      },
      forgotScanApprovalStep: {
        findMany: vi.fn().mockResolvedValue([{ id: 'step-1', stepOrder: 1, status: 'PENDING' }]),
        update: vi.fn().mockResolvedValue({}),
      },
    } as never

    await attachAllPendingDefaultChains(prisma)

    expect(applyToAttendance).toHaveBeenCalledWith('fs-1', prisma)
    expect(forgotScanUpdate).toHaveBeenCalledWith({
      where: { id: 'fs-1' },
      data: { currentStepOrder: 0, status: 'APPROVED' },
    })
  })

  it('FORGOT_SCAN: rejects with a clear note when the attendance correction can no longer be applied', async () => {
    getDefaultChain.mockImplementation((_p: unknown, type: string) =>
      Promise.resolve(type === 'FORGOT_SCAN' ? { id: 'fs-chain' } : null),
    )
    applyToAttendance.mockResolvedValueOnce(false)
    const forgotScanUpdate = vi.fn().mockResolvedValue({})
    const prisma = {
      leaveRequest: { findMany: vi.fn().mockResolvedValue([]) },
      outsideWorkRequest: { findMany: vi.fn().mockResolvedValue([]) },
      weeklyLawyerPlan: { findMany: vi.fn().mockResolvedValue([]) },
      forgotScanRequest: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ id: 'fs-1', userId: 'user-1' }]),
        update: forgotScanUpdate,
      },
      forgotScanApprovalStep: {
        findMany: vi.fn().mockResolvedValue([{ id: 'step-1', stepOrder: 1, status: 'PENDING' }]),
        update: vi.fn().mockResolvedValue({}),
      },
    } as never

    await attachAllPendingDefaultChains(prisma)

    expect(forgotScanUpdate).toHaveBeenCalledWith({
      where: { id: 'fs-1' },
      data: {
        currentStepOrder: 0,
        status: 'REJECTED',
        hrNote: 'ไม่สามารถ apply เวลาได้ — ไม่พบ attendance record ของวันนี้',
      },
    })
  })
})
