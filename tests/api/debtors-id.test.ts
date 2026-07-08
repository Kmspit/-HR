import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    debtor: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PATCH } from '@/app/api/debtors/[id]/route'

const params = Promise.resolve({ id: 'debtor-1' })

function makeReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/debtors/debtor-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/debtors/[id] — requires role or assignment ownership before editing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.debtor.findUnique).mockResolvedValue({ assignedToId: 'collector-1', paidAmount: 1000 } as never)
    vi.mocked(prisma.debtor.update).mockResolvedValue({ id: 'debtor-1' } as never)
  })

  it('forbids a staff user who is neither company-wide-managed nor the assigned collector', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'stranger-1', role: 'LAWYER' } } as never)
    const res = await PATCH(makeReq({ totalDebt: 999999 }), { params })
    expect(res.status).toBe(403)
    expect(prisma.debtor.update).not.toHaveBeenCalled()
  })

  it('forbids a CLIENT-portal session outright', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'client-1', role: 'CLIENT' } } as never)
    const res = await PATCH(makeReq({ totalDebt: 1 }), { params })
    expect(res.status).toBe(403)
    expect(prisma.debtor.update).not.toHaveBeenCalled()
  })

  it('allows the collector this debtor is assigned to', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'collector-1', role: 'ENFORCEMENT' } } as never)
    const res = await PATCH(makeReq({ note: 'ติดตามแล้ว' }), { params })
    expect(res.status).toBe(200)
    expect(prisma.debtor.update).toHaveBeenCalled()
  })

  it('allows a company-wide role (e.g. MANAGER_HR) regardless of assignment', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'hr-1', role: 'MANAGER_HR' } } as never)
    const res = await PATCH(makeReq({ totalDebt: 5000 }), { params })
    expect(res.status).toBe(200)
    expect(prisma.debtor.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ totalDebt: 5000, remainingDebt: 4000 }) }),
    )
  })

  it('returns 404 for a nonexistent debtor before checking permission fields', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'hr-1', role: 'MANAGER_HR' } } as never)
    vi.mocked(prisma.debtor.findUnique).mockResolvedValue(null as never)
    const res = await PATCH(makeReq({ note: 'x' }), { params })
    expect(res.status).toBe(404)
  })
})
