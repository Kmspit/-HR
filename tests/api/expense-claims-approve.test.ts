import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    expenseClaim: { findUnique: vi.fn(), updateMany: vi.fn() },
    user: { findUnique: vi.fn().mockResolvedValue({ branchId: null, managerId: null, teamLeaderId: null }) },
  },
}))

vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { POST } from '@/app/api/expense-claims/[id]/approve/route'

const params = Promise.resolve({ id: 'claim-1' })

const submitterId = 'requester-1'
const claimRow = {
  id: 'claim-1', title: 'ค่าน้ำมัน', amount: 1500, status: 'PENDING',
  submittedBy: { id: submitterId, name: 'Requester' },
}

function makeReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/expense-claims/claim-1/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/expense-claims/[id]/approve — no self-approval, atomic status guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.expenseClaim.findUnique).mockResolvedValue(claimRow as never)
    vi.mocked(prisma.expenseClaim.updateMany).mockResolvedValue({ count: 1 } as never)
  })

  it('forbids the requester from supervisor_approve-ing their own claim, even as a company-wide role', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: submitterId, role: 'MANAGER_HR', branchId: null } } as never)
    const res = await POST(makeReq({ action: 'supervisor_approve' }), { params })
    expect(res.status).toBe(403)
    expect(prisma.expenseClaim.updateMany).not.toHaveBeenCalled()
  })

  it('forbids the requester from ceo_approve-ing their own claim', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: submitterId, role: 'CEO', branchId: null } } as never)
    const res = await POST(makeReq({ action: 'ceo_approve' }), { params })
    expect(res.status).toBe(403)
    expect(prisma.expenseClaim.updateMany).not.toHaveBeenCalled()
  })

  it('forbids the requester from mark_paid-ing their own claim', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: submitterId, role: 'SUPER_ADMIN', branchId: null } } as never)
    const res = await POST(makeReq({ action: 'mark_paid' }), { params })
    expect(res.status).toBe(403)
    expect(prisma.expenseClaim.updateMany).not.toHaveBeenCalled()
  })

  it('allows a different company-wide approver to approve the same claim', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'hr-1', role: 'MANAGER_HR', branchId: null } } as never)
    vi.mocked(prisma.expenseClaim.findUnique)
      .mockResolvedValueOnce(claimRow as never)
      .mockResolvedValueOnce({ ...claimRow, status: 'SUPERVISOR_APPROVED' } as never)
    const res = await POST(makeReq({ action: 'supervisor_approve' }), { params })
    expect(res.status).toBe(200)
    expect(prisma.expenseClaim.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'claim-1', status: { in: ['PENDING'] } } }),
    )
  })

  it('rejects a double mark_paid with 409 when the status precondition no longer matches (atomic guard)', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'hr-1', role: 'MANAGER_HR', branchId: null } } as never)
    vi.mocked(prisma.expenseClaim.findUnique).mockResolvedValue({ ...claimRow, status: 'CEO_APPROVED' } as never)
    // Simulate a concurrent request having already flipped the status: the
    // conditional updateMany matches zero rows.
    vi.mocked(prisma.expenseClaim.updateMany).mockResolvedValue({ count: 0 } as never)
    const res = await POST(makeReq({ action: 'mark_paid' }), { params })
    expect(res.status).toBe(409)
  })

  it('a different HR/finance role can still mark_paid a CEO_APPROVED claim normally', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'hr-1', role: 'HR', branchId: null } } as never)
    vi.mocked(prisma.expenseClaim.findUnique)
      .mockResolvedValueOnce({ ...claimRow, status: 'CEO_APPROVED' } as never)
      .mockResolvedValueOnce({ ...claimRow, status: 'PAID' } as never)
    const res = await POST(makeReq({ action: 'mark_paid' }), { params })
    expect(res.status).toBe(200)
    expect(prisma.expenseClaim.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'claim-1', status: { in: ['CEO_APPROVED'] } } }),
    )
  })
})
