import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    leaveRequest: { findUnique: vi.fn() },
    outsideWorkRequest: { findUnique: vi.fn() },
    weeklyLawyerPlan: { findUnique: vi.fn() },
    forgotScanRequest: { findUnique: vi.fn() },
    approvalHistory: { create: vi.fn() },
  },
}))
vi.mock('@/lib/approval-chain', () => ({
  executeLeaveStepAction: vi.fn(),
  executeOutsideWorkStepAction: vi.fn(),
}))
vi.mock('@/lib/weekly-plan-chain', () => ({ executeWeeklyPlanStepAction: vi.fn() }))
vi.mock('@/lib/forgot-scan-chain', () => ({ executeForgotScanStepAction: vi.fn() }))
vi.mock('@/lib/attach-default-chain', () => ({
  attachDefaultChainForLeave: vi.fn().mockResolvedValue(undefined),
  attachDefaultChainForOutside: vi.fn(),
  attachDefaultChainForWeekly: vi.fn(),
  attachDefaultChainForForgotScan: vi.fn(),
}))
vi.mock('@/lib/notifications', () => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) =>
    NextResponse.json({ error: String(err) }, { status: 500 }),
  runNotify: (fn: () => Promise<unknown>) => fn().catch(() => {}),
}))
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers({ 'x-forwarded-for': '127.0.0.1' })),
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { executeLeaveStepAction } from '@/lib/approval-chain'
import { attachDefaultChainForLeave } from '@/lib/attach-default-chain'
import { POST } from '@/app/api/approvals/route'

function postBody(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/approvals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/approvals', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 without session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const res = await POST(postBody({ type: 'LEAVE', requestId: 'lr1', action: 'APPROVE' }))
    expect(res.status).toBe(401)
  })

  it('returns 403 for EMPLOYEE on leave approval', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', role: 'EMPLOYEE' } } as never)
    const res = await POST(postBody({ type: 'LEAVE', requestId: 'lr1', action: 'APPROVE' }))
    expect(res.status).toBe(403)
  })

  it('returns 400 when body is incomplete', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'mgr1', role: 'MANAGER' } } as never)
    const res = await POST(postBody({ type: 'LEAVE' }))
    expect(res.status).toBe(400)
  })

  it('chain-approves leave when chain exists', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'mgr1', role: 'MANAGER' } } as never)
    vi.mocked(prisma.leaveRequest.findUnique).mockResolvedValue({
      id: 'lr1', userId: 'u2', chainConfigId: 'c1',
    } as never)
    vi.mocked(executeLeaveStepAction).mockResolvedValue({
      success: true,
      action: 'APPROVE',
      finalized: true,
      nextStepOrder: null,
      stepName: 'หัวหน้างาน',
    })
    const res = await POST(postBody({ type: 'LEAVE', requestId: 'lr1', action: 'APPROVE' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.finalized).toBe(true)
    expect(attachDefaultChainForLeave).not.toHaveBeenCalled()
  })

  it('auto-attaches default chain when missing', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'mgr1', role: 'MANAGER_HR' } } as never)
    vi.mocked(prisma.leaveRequest.findUnique)
      .mockResolvedValueOnce({ id: 'lr1', userId: 'u2', chainConfigId: null } as never)
      .mockResolvedValue({ id: 'lr1', userId: 'u2', chainConfigId: 'c-new' } as never)
    vi.mocked(executeLeaveStepAction).mockResolvedValue({
      success: true,
      action: 'APPROVE',
      finalized: false,
      nextStepOrder: 2,
      stepName: 'HR',
    })
    const res = await POST(postBody({ type: 'LEAVE', requestId: 'lr1', action: 'APPROVE' }))
    expect(res.status).toBe(200)
    expect(attachDefaultChainForLeave).toHaveBeenCalledWith(prisma, 'lr1', 'u2')
  })
})
