import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    case:          { findUnique: vi.fn(), update: vi.fn() },
    caseFinancial: { upsert: vi.fn() },
    caseTimeline:  { create: vi.fn().mockResolvedValue({}) },
  },
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PATCH } from '@/app/api/cases/[id]/financial/route'

const params = Promise.resolve({ id: 'case-1' })
const execSession = { user: { id: 'hr-1', role: 'MANAGER_HR', department: null } }

function makeReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/cases/case-1/financial', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/cases/[id]/financial — collectedAmount is not a client-settable field', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(execSession as never)
    vi.mocked(prisma.caseFinancial.upsert).mockResolvedValue({ id: 'fin-1' } as never)
  })

  it('ignores a collectedAmount sent in the body — never persisted, never mirrored to Case', async () => {
    const res = await PATCH(makeReq({ debtAmount: 100000, collectedAmount: 999999, legalFee: 5000 }), { params })
    expect(res.status).toBe(200)

    expect(prisma.caseFinancial.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.not.objectContaining({ collectedAmount: expect.anything() }),
        update: expect.not.objectContaining({ collectedAmount: expect.anything() }),
      }),
    )
    expect(prisma.case.update).not.toHaveBeenCalled()
  })

  it('still allows editing debtAmount and fee fields normally', async () => {
    const res = await PATCH(makeReq({ debtAmount: 200000, legalFee: 3000, courtFee: 1000 }), { params })
    expect(res.status).toBe(200)
    expect(prisma.caseFinancial.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ debtAmount: 200000, legalFee: 3000, courtFee: 1000 }),
      }),
    )
  })
})
