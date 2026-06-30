import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  canUserActOnStep,
  applyChainToLeave,
  isOrgSupervisorTemplateStep,
} from '@/lib/approval-chain'

describe('canUserActOnStep', () => {
  const base = {
    id: 's1',
    stepOrder: 1,
    stepName: 'หัวหน้า',
    canSkip: false,
  }

  it('allows matching approverId', () => {
    expect(canUserActOnStep(
      { ...base, approverId: 'u1', approverRole: null },
      'u1',
      'TEAM_LEADER',
    )).toBe(true)
  })

  it('allows matching approverRole', () => {
    expect(canUserActOnStep(
      { ...base, approverId: null, approverRole: 'HR' },
      'other',
      'HR',
    )).toBe(true)
  })

  it('denies when no approver configured', () => {
    expect(canUserActOnStep(
      { ...base, approverId: null, approverRole: null },
      'anyone',
      'EMPLOYEE',
    )).toBe(false)
  })

  it('denies wrong user for approverId step', () => {
    expect(canUserActOnStep(
      { ...base, approverId: 'u1', approverRole: null },
      'u2',
      'TEAM_LEADER',
    )).toBe(false)
  })
})

describe('isOrgSupervisorTemplateStep', () => {
  it('matches step 1 with canSkip and no approver', () => {
    expect(isOrgSupervisorTemplateStep({
      stepOrder: 1,
      stepName: 'หัวหน้า',
      approverRole: null,
      approverId: null,
      canSkip: true,
    })).toBe(true)
  })
})

describe('applyChainToLeave', () => {
  const mockPrisma = {
    user: { findUnique: vi.fn() },
    approvalChainConfig: { findUnique: vi.fn() },
    leaveApprovalStep: { createMany: vi.fn() },
    leaveRequest: { update: vi.fn() },
    notification: { create: vi.fn() },
  }

  beforeEach(() => vi.clearAllMocks())

  it('resolves org supervisor on step 1 and notifies them', async () => {
    vi.mocked(mockPrisma.user.findUnique)
      .mockResolvedValueOnce({ role: 'EMPLOYEE' } as never)
      .mockResolvedValueOnce({ teamLeaderId: 'tl-1', managerId: null } as never)
    vi.mocked(mockPrisma.approvalChainConfig.findUnique).mockResolvedValue({
      id: 'chain-1',
      isActive: true,
      steps: [{
        id: 's1',
        stepOrder: 1,
        stepName: 'หัวหน้า',
        approverRole: null,
        approverId: null,
        canSkip: true,
      }],
    } as never)
    vi.mocked(mockPrisma.leaveApprovalStep.createMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(mockPrisma.leaveRequest.update).mockResolvedValue({} as never)
    vi.mocked(mockPrisma.notification.create).mockResolvedValue({} as never)

    await applyChainToLeave(mockPrisma as never, 'leave-1', 'chain-1', 'emp-1')

    expect(mockPrisma.leaveApprovalStep.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ approverId: 'tl-1', status: 'PENDING' })],
    })
    expect(mockPrisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'tl-1' }) }),
    )
  })
})
