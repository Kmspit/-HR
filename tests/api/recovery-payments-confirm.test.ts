import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    recoveryPayment: { findUnique: vi.fn(), update: vi.fn() },
    debtor:          { update: vi.fn(), findUnique: vi.fn() },
    promiseToPay:    { update: vi.fn(), count: vi.fn().mockResolvedValue(0) },
    caseFinancial:   { upsert: vi.fn() },
    case:            { update: vi.fn() },
    user:            { findMany: vi.fn().mockResolvedValue([]) },
    notification:    { createMany: vi.fn().mockResolvedValue({}) },
  },
}))

vi.mock('@/lib/automation-engine', () => ({
  triggerAutomation: vi.fn().mockReturnValue({ catch: () => undefined }),
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PATCH } from '@/app/api/recovery/payments/[id]/route'

const params = Promise.resolve({ id: 'pmt-1' })
const confirmSession = { user: { id: 'mgr-1', role: 'MANAGER_HR', name: 'Manager' } }

function makeReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/recovery/payments/pmt-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const basePayment = {
  id: 'pmt-1', status: 'PENDING', amount: 5000, debtorId: 'debtor-1', caseId: 'case-1',
  promiseId: null, promise: null,
}

describe('PATCH /api/recovery/payments/[id] — confirming reliably upserts CaseFinancial.collectedAmount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(confirmSession as never)
    vi.mocked(prisma.recoveryPayment.findUnique).mockResolvedValue(basePayment as never)
    vi.mocked(prisma.recoveryPayment.update).mockResolvedValue({ ...basePayment, status: 'CONFIRMED' } as never)
    vi.mocked(prisma.debtor.update).mockResolvedValue({} as never)
    vi.mocked(prisma.debtor.findUnique).mockResolvedValue({ riskLevel: 'LOW' } as never)
  })

  it('upserts CaseFinancial.collectedAmount even when no row exists yet for the case', async () => {
    const res = await PATCH(makeReq({ status: 'CONFIRMED' }), { params })
    expect(res.status).toBe(200)
    expect(prisma.caseFinancial.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where:  { caseId: 'case-1' },
        create: expect.objectContaining({ caseId: 'case-1', collectedAmount: 5000 }),
        update: expect.objectContaining({ collectedAmount: { increment: 5000 } }),
      }),
    )
    expect(prisma.case.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'case-1' }, data: { collectedAmount: { increment: 5000 } } }),
    )
  })

  it('rejects confirmation from a non-CAN_CONFIRM role', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'emp-1', role: 'LAWYER', name: 'Lawyer' } } as never)
    const res = await PATCH(makeReq({ status: 'CONFIRMED' }), { params })
    expect(res.status).toBe(403)
    expect(prisma.caseFinancial.upsert).not.toHaveBeenCalled()
  })

  it('does not touch CaseFinancial when the payment has no linked case', async () => {
    vi.mocked(prisma.recoveryPayment.findUnique).mockResolvedValue({ ...basePayment, caseId: null } as never)
    const res = await PATCH(makeReq({ status: 'CONFIRMED' }), { params })
    expect(res.status).toBe(200)
    expect(prisma.caseFinancial.upsert).not.toHaveBeenCalled()
  })
})
