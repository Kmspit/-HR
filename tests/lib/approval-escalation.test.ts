import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  notifyRole: vi.fn().mockResolvedValue(undefined),
  sendLineNotify: vi.fn().mockResolvedValue(undefined),
}))

import { runApprovalEscalation } from '@/lib/approval-escalation'
import { createNotification, notifyRole } from '@/lib/notifications'

const mockPrisma = {
  leaveRequest: { findMany: vi.fn() },
  outsideWorkRequest: { findMany: vi.fn() },
  user: { findMany: vi.fn() },
  notification: { findFirst: vi.fn() },
}

describe('runApprovalEscalation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reminds leave approver after 48h', async () => {
    const old = new Date(Date.now() - 50 * 60 * 60 * 1000)
    vi.mocked(mockPrisma.leaveRequest.findMany).mockResolvedValue([
      {
        id: 'leave-1',
        currentStepOrder: 1,
        updatedAt: old,
        user: { name: 'Test User' },
        stepLogs: [{
          stepOrder: 1,
          status: 'PENDING',
          stepName: 'หัวหน้า',
          approverId: 'tl-1',
          approverRole: null,
        }],
      },
    ] as never)
    vi.mocked(mockPrisma.outsideWorkRequest.findMany).mockResolvedValue([] as never)
    vi.mocked(mockPrisma.notification.findFirst).mockResolvedValue(null as never)

    const result = await runApprovalEscalation(mockPrisma as never)

    expect(result.leaveReminded).toBe(1)
    expect(createNotification).toHaveBeenCalled()
    expect(notifyRole).not.toHaveBeenCalled()
  })
})
