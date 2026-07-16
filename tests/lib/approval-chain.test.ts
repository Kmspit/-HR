import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}))

import { createNotification } from '@/lib/notifications'
import {
  canUserActOnStep,
  applyChainToLeave,
  isOrgSupervisorTemplateStep,
  resolveOrgSupervisorId,
} from '@/lib/approval-chain'

describe('resolveOrgSupervisorId (Phase B — inactive supervisors must not be assigned)', () => {
  const mockPrisma = { user: { findUnique: vi.fn() } }
  beforeEach(() => vi.clearAllMocks())

  it('returns the active team leader', async () => {
    vi.mocked(mockPrisma.user.findUnique).mockResolvedValue({
      teamLeader: { id: 'tl-1', status: 'ACTIVE' },
      manager:    { id: 'mgr-1', status: 'ACTIVE' },
    } as never)
    const id = await resolveOrgSupervisorId(mockPrisma as never, 'emp-1')
    expect(id).toBe('tl-1')
  })

  it('falls back to the active manager when the team leader is inactive', async () => {
    vi.mocked(mockPrisma.user.findUnique).mockResolvedValue({
      teamLeader: { id: 'tl-1', status: 'INACTIVE' },
      manager:    { id: 'mgr-1', status: 'ACTIVE' },
    } as never)
    const id = await resolveOrgSupervisorId(mockPrisma as never, 'emp-1')
    expect(id).toBe('mgr-1')
  })

  it('returns null (not an inactive user) when both team leader and manager are inactive', async () => {
    vi.mocked(mockPrisma.user.findUnique).mockResolvedValue({
      teamLeader: { id: 'tl-1', status: 'INACTIVE' },
      manager:    { id: 'mgr-1', status: 'INACTIVE' },
    } as never)
    const id = await resolveOrgSupervisorId(mockPrisma as never, 'emp-1')
    expect(id).toBeNull()
  })

  it('returns null when neither is set', async () => {
    vi.mocked(mockPrisma.user.findUnique).mockResolvedValue({
      teamLeader: null, manager: null,
    } as never)
    const id = await resolveOrgSupervisorId(mockPrisma as never, 'emp-1')
    expect(id).toBeNull()
  })
})

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

  it('allows MANAGER_HR on HR approverRole step', () => {
    expect(canUserActOnStep(
      { ...base, approverId: null, approverRole: 'HR' },
      'mgr-hr-1',
      'MANAGER_HR',
    )).toBe(true)
  })

  it('denies EMPLOYEE on HR approverRole step', () => {
    expect(canUserActOnStep(
      { ...base, approverId: null, approverRole: 'HR' },
      'emp-1',
      'EMPLOYEE',
    )).toBe(false)
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
    leaveApprovalStep: { createMany: vi.fn(), count: vi.fn().mockResolvedValue(0) },
    leaveRequest: { update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  }

  beforeEach(() => vi.clearAllMocks())

  it('resolves org supervisor on step 1 and notifies them', async () => {
    vi.mocked(mockPrisma.user.findUnique)
      .mockResolvedValueOnce({ role: 'EMPLOYEE' } as never)
      .mockResolvedValueOnce({
        teamLeader: { id: 'tl-1', status: 'ACTIVE' },
        manager:    null,
      } as never)
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

    await applyChainToLeave(mockPrisma as never, 'leave-1', 'chain-1', 'emp-1')

    expect(mockPrisma.leaveApprovalStep.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ approverId: 'tl-1', status: 'PENDING' })],
    })
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'tl-1' }),
    )
  })
})
