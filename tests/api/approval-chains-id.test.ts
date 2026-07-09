import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/access-control', () => ({ canManageUsers: vi.fn().mockReturnValue(true) }))
vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

const approvalChainConfigFindUnique = vi.fn()
const approvalChainConfigUpdate = vi.fn()
const approvalChainConfigUpdateMany = vi.fn().mockResolvedValue({ count: 0 })

const txStepFindMany = vi.fn()
const txStepDelete = vi.fn().mockResolvedValue({})
const txStepUpdate = vi.fn().mockResolvedValue({})
const txStepCreate = vi.fn().mockResolvedValue({})
const txLeaveCount = vi.fn().mockResolvedValue(0)
const txOutsideCount = vi.fn().mockResolvedValue(0)
const txWeeklyCount = vi.fn().mockResolvedValue(0)
const txForgotCount = vi.fn().mockResolvedValue(0)

vi.mock('@/lib/prisma', () => ({
  prisma: {
    approvalChainConfig: {
      findUnique: (...a: unknown[]) => approvalChainConfigFindUnique(...a),
      update: (...a: unknown[]) => approvalChainConfigUpdate(...a),
      updateMany: (...a: unknown[]) => approvalChainConfigUpdateMany(...a),
    },
    $transaction: async (cb: (tx: unknown) => unknown) =>
      cb({
        approvalChainStep: {
          findMany: (...a: unknown[]) => txStepFindMany(...a),
          delete: (...a: unknown[]) => txStepDelete(...a),
          update: (...a: unknown[]) => txStepUpdate(...a),
          create: (...a: unknown[]) => txStepCreate(...a),
        },
        leaveApprovalStep: { count: (...a: unknown[]) => txLeaveCount(...a) },
        outsideWorkApprovalStep: { count: (...a: unknown[]) => txOutsideCount(...a) },
        weeklyPlanApprovalStep: { count: (...a: unknown[]) => txWeeklyCount(...a) },
        forgotScanApprovalStep: { count: (...a: unknown[]) => txForgotCount(...a) },
      }),
  },
}))

import { auth } from '@/lib/auth'
import { PUT } from '@/app/api/leave/approval-chains/[id]/route'

function makePut(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/leave/approval-chains/chain-1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const params = Promise.resolve({ id: 'chain-1' })

describe('PUT /api/leave/approval-chains/[id] — step edits no longer crash on FK violation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue({ user: { id: 'admin-1', role: 'HR' } } as never)
    approvalChainConfigFindUnique.mockResolvedValue({
      id: 'chain-1', entityType: 'LEAVE', isDefault: false,
    })
    approvalChainConfigUpdate.mockResolvedValue({ id: 'chain-1', steps: [] })
  })

  it('updates an existing step in place (same position) instead of delete+recreate — preserves its id for history', async () => {
    txStepFindMany.mockResolvedValue([{ id: 'step-1', stepOrder: 1, stepName: 'หัวหน้าทีม' }])

    const res = await PUT(
      makePut({ steps: [{ stepOrder: 1, stepName: 'ผู้จัดการ', approverRole: 'MANAGER' }] }),
      { params },
    )

    expect(res.status).toBe(200)
    expect(txStepUpdate).toHaveBeenCalledWith({
      where: { id: 'step-1' },
      data: { stepName: 'ผู้จัดการ', approverRole: 'MANAGER', approverId: null, canSkip: false },
    })
    expect(txStepDelete).not.toHaveBeenCalled()
    expect(txStepCreate).not.toHaveBeenCalled()
  })

  it('creates a step for a new position not previously present', async () => {
    txStepFindMany.mockResolvedValue([])

    const res = await PUT(
      makePut({ steps: [{ stepOrder: 1, stepName: 'หัวหน้าทีม', approverRole: 'MANAGER' }] }),
      { params },
    )

    expect(res.status).toBe(200)
    expect(txStepCreate).toHaveBeenCalledWith({
      data: { chainId: 'chain-1', stepOrder: 1, stepName: 'หัวหน้าทีม', approverRole: 'MANAGER', approverId: null, canSkip: false },
    })
  })

  it('deletes a dropped position that has no historical dependents', async () => {
    txStepFindMany.mockResolvedValue([
      { id: 'step-1', stepOrder: 1, stepName: 'หัวหน้าทีม' },
      { id: 'step-2', stepOrder: 2, stepName: 'HR' },
    ])
    // No dependents on step-2 for any entity type.
    txLeaveCount.mockResolvedValue(0)
    txOutsideCount.mockResolvedValue(0)
    txWeeklyCount.mockResolvedValue(0)
    txForgotCount.mockResolvedValue(0)

    const res = await PUT(
      makePut({ steps: [{ stepOrder: 1, stepName: 'หัวหน้าทีม', approverRole: 'MANAGER' }] }),
      { params },
    )

    expect(res.status).toBe(200)
    expect(txStepDelete).toHaveBeenCalledWith({ where: { id: 'step-2' } })
  })

  it('refuses (409, clear message) to drop a position that historical requests still reference — no partial mutation', async () => {
    txStepFindMany.mockResolvedValue([
      { id: 'step-1', stepOrder: 1, stepName: 'หัวหน้าทีม' },
      { id: 'step-2', stepOrder: 2, stepName: 'CEO อนุมัติ' },
    ])
    // step-2 ("CEO อนุมัติ") has 9 historical leave-approval-step rows pointing at it.
    txLeaveCount.mockImplementation(({ where }: { where: { chainStepId: string } }) =>
      Promise.resolve(where.chainStepId === 'step-2' ? 9 : 0),
    )

    const res = await PUT(
      makePut({ steps: [{ stepOrder: 1, stepName: 'หัวหน้าทีม', approverRole: 'MANAGER' }] }),
      { params },
    )

    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).toContain('CEO อนุมัติ')
    expect(txStepDelete).not.toHaveBeenCalled()
    expect(txStepUpdate).not.toHaveBeenCalled()
    expect(txStepCreate).not.toHaveBeenCalled()
    expect(approvalChainConfigUpdate).not.toHaveBeenCalled()
  })

  it('renaming/re-assigning a step of an already-used default chain succeeds (the exact production scenario for leave-default-chain-v1)', async () => {
    // Mirrors production: chain has 3 steps, all with historical dependents —
    // editing without changing the position count must not throw the old FK error.
    txStepFindMany.mockResolvedValue([
      { id: 's1', stepOrder: 1, stepName: 'หัวหน้าทีม' },
      { id: 's2', stepOrder: 2, stepName: 'HR' },
      { id: 's3', stepOrder: 3, stepName: 'CEO' },
    ])
    txLeaveCount.mockResolvedValue(9) // every step has dependents, but none are being removed

    const res = await PUT(
      makePut({
        steps: [
          { stepOrder: 1, stepName: 'หัวหน้าทีม', approverRole: 'TEAM_LEADER' },
          { stepOrder: 2, stepName: 'ฝ่ายบุคคล', approverRole: 'HR' },
          { stepOrder: 3, stepName: 'CEO', approverRole: 'CEO' },
        ],
      }),
      { params },
    )

    expect(res.status).toBe(200)
    expect(txStepDelete).not.toHaveBeenCalled()
    expect(txStepUpdate).toHaveBeenCalledTimes(3)
  })
})
