import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    billingInvoice: { findUnique: vi.fn(), update: vi.fn() },
    billingPayment: { findUnique: vi.fn(), create: vi.fn() },
  },
}))

vi.mock('cloudinary', () => ({
  v2: { config: vi.fn(), uploader: { upload_stream: vi.fn() } },
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { POST } from '@/app/api/invoices/[id]/payments/route'

const financeSession = { user: { id: 'hr-1', role: 'HR', name: 'HR' } }
const params = Promise.resolve({ id: 'inv-1' })

function makeReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/invoices/inv-1/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const baseInvoice = { id: 'inv-1', totalAmount: 10000, paidAmount: 0, remainingAmount: 10000, status: 'SENT' }

describe('POST /api/invoices/[id]/payments — atomic increment + idempotency key', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(financeSession as never)
    vi.mocked(prisma.billingInvoice.findUnique).mockResolvedValue(baseInvoice as never)
    vi.mocked(prisma.billingPayment.findUnique).mockResolvedValue(null as never)
    vi.mocked(prisma.billingPayment.create).mockResolvedValue({ id: 'pay-1', amount: 4000 } as never)
  })

  it('increments paidAmount atomically instead of computing it from a stale read', async () => {
    vi.mocked(prisma.billingInvoice.update).mockResolvedValueOnce({ ...baseInvoice, paidAmount: 4000 } as never)
    const res = await POST(makeReq({ amount: 4000, idempotencyKey: 'key-1' }), { params })
    expect(res.status).toBe(201)

    expect(prisma.billingInvoice.update).toHaveBeenNthCalledWith(1,
      expect.objectContaining({ where: { id: 'inv-1' }, data: { paidAmount: { increment: 4000 } } }),
    )
    // Status/remaining recomputed from the increment's own fresh return value (4000), not the stale initial read (0).
    expect(prisma.billingInvoice.update).toHaveBeenNthCalledWith(2,
      expect.objectContaining({ data: { remainingAmount: 6000, status: 'PENDING_PAYMENT' } }),
    )
  })

  it('marks the invoice PAID once the atomic increment reaches the total', async () => {
    vi.mocked(prisma.billingInvoice.update).mockResolvedValueOnce({ ...baseInvoice, paidAmount: 10000 } as never)
    const res = await POST(makeReq({ amount: 10000, idempotencyKey: 'key-2' }), { params })
    expect(res.status).toBe(201)
    expect(prisma.billingInvoice.update).toHaveBeenNthCalledWith(2,
      expect.objectContaining({ data: { remainingAmount: 0, status: 'PAID' } }),
    )
  })

  it('returns the existing payment (200, not a new 201) when the idempotency key was already used', async () => {
    vi.mocked(prisma.billingPayment.findUnique).mockResolvedValue({ id: 'pay-existing', amount: 4000 } as never)
    const res = await POST(makeReq({ amount: 4000, idempotencyKey: 'key-1' }), { params })
    expect(res.status).toBe(200)
    expect(prisma.billingPayment.create).not.toHaveBeenCalled()
    expect(prisma.billingInvoice.update).not.toHaveBeenCalled()
  })

  it('falls back to returning the existing payment when a concurrent request wins the idempotency-key race (P2002)', async () => {
    const p2002 = new Error('Unique constraint failed on billing_payments_idempotency_key_idx') as Error & { code: string }
    p2002.code = 'P2002'
    vi.mocked(prisma.billingPayment.create).mockRejectedValue(p2002)
    vi.mocked(prisma.billingPayment.findUnique)
      .mockResolvedValueOnce(null as never) // pre-check: not there yet
      .mockResolvedValueOnce({ id: 'pay-winner', amount: 4000 } as never) // post-P2002 lookup: the other request's row

    const res = await POST(makeReq({ amount: 4000, idempotencyKey: 'key-3' }), { params })
    expect(res.status).toBe(200)
    expect(prisma.billingInvoice.update).not.toHaveBeenCalled()
  })

  it('rejects an invalid amount before touching idempotency/create at all', async () => {
    const res = await POST(makeReq({ amount: 0, idempotencyKey: 'key-4' }), { params })
    expect(res.status).toBe(400)
    expect(prisma.billingPayment.create).not.toHaveBeenCalled()
  })
})
