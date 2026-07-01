import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findMany: vi.fn() } },
}))

import { prisma } from '@/lib/prisma'
import {
  canViewApprovalRequest,
  canActOnApprovalStep,
} from '@/lib/approval-request-access'

const baseRequest = {
  requestedById: 'emp-1',
  steps: [
    { id: 's1', stepOrder: 1, status: 'PENDING', approverId: null, approverRole: 'MANAGER' },
  ],
}

describe('approval-request-access', () => {
  beforeEach(() => vi.clearAllMocks())

  it('allows requester to view', async () => {
    const ok = await canViewApprovalRequest(prisma, 'emp-1', 'EMPLOYEE', baseRequest)
    expect(ok).toBe(true)
  })

  it('denies unrelated employee', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([])
    const ok = await canViewApprovalRequest(prisma, 'other-1', 'EMPLOYEE', baseRequest)
    expect(ok).toBe(false)
  })

  it('allows manager on direct report step', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'emp-1' }] as never)
    const ok = await canActOnApprovalStep(
      prisma,
      'mgr-1',
      'MANAGER',
      baseRequest,
      baseRequest.steps[0],
    )
    expect(ok).toBe(true)
  })
})
