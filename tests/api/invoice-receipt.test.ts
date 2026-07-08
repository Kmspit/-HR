import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    billingInvoice: { findUnique: vi.fn() },
    billingReceipt: { count: vi.fn(), create: vi.fn() },
  },
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { POST } from '@/app/api/invoices/[id]/receipt/route'

const financeSession = { user: { id: 'hr-1', role: 'HR', name: 'HR' } }
const params = Promise.resolve({ id: 'inv-1' })

function makeReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/invoices/inv-1/receipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const baseInvoice = {
  id: 'inv-1', clientName: 'บริษัท เอ', vatRate: 0.07, whtRate: 0.03, paidAmount: 10000,
  payments: [{ id: 'pmt-1', amount: 6000 }, { id: 'pmt-2', amount: 4000 }],
  receipts: [] as { id: string; paymentId: string | null; amount: number }[],
}

describe('POST /api/invoices/[id]/receipt — per-payment amount, no duplicate/overstated receipts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(financeSession as never)
    vi.mocked(prisma.billingReceipt.count).mockResolvedValue(0 as never)
    vi.mocked(prisma.billingReceipt.create).mockImplementation(
      (async (args: unknown) => ({ id: 'rcp-1', ...(args as { data: object }).data })) as never,
    )
  })

  it('issues a receipt for the specific payment amount, not the cumulative paidAmount', async () => {
    vi.mocked(prisma.billingInvoice.findUnique).mockResolvedValue(baseInvoice as never)
    const res = await POST(makeReq({ paymentId: 'pmt-1' }), { params })
    expect(res.status).toBe(201)
    expect(prisma.billingReceipt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 6000, paymentId: 'pmt-1' }) }),
    )
  })

  it('rejects a second receipt request for the same paymentId (duplicate)', async () => {
    vi.mocked(prisma.billingInvoice.findUnique).mockResolvedValue({
      ...baseInvoice,
      receipts: [{ id: 'rcp-existing', paymentId: 'pmt-1', amount: 6000 }],
    } as never)
    const res = await POST(makeReq({ paymentId: 'pmt-1' }), { params })
    expect(res.status).toBe(409)
    expect(prisma.billingReceipt.create).not.toHaveBeenCalled()
  })

  it('without paymentId, issues only the un-receipted remainder of paidAmount', async () => {
    vi.mocked(prisma.billingInvoice.findUnique).mockResolvedValue({
      ...baseInvoice,
      receipts: [{ id: 'rcp-existing', paymentId: 'pmt-1', amount: 6000 }],
    } as never)
    const res = await POST(makeReq({}), { params })
    expect(res.status).toBe(201)
    expect(prisma.billingReceipt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 4000 }) }),
    )
  })

  it('rejects issuing another whole-invoice receipt once the full paidAmount is already receipted (prevents overstated duplicate)', async () => {
    vi.mocked(prisma.billingInvoice.findUnique).mockResolvedValue({
      ...baseInvoice,
      receipts: [{ id: 'rcp-existing', paymentId: null, amount: 10000 }],
    } as never)
    const res = await POST(makeReq({}), { params })
    expect(res.status).toBe(409)
    expect(prisma.billingReceipt.create).not.toHaveBeenCalled()
  })

  it('rejects a cross-origin request with 403 (CSRF)', async () => {
    vi.mocked(prisma.billingInvoice.findUnique).mockResolvedValue(baseInvoice as never)
    const req = new NextRequest('http://localhost/api/invoices/inv-1/receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'https://evil.example.com', host: 'localhost' },
      body: JSON.stringify({ paymentId: 'pmt-1' }),
    })
    const res = await POST(req, { params })
    expect(res.status).toBe(403)
    expect(prisma.billingReceipt.create).not.toHaveBeenCalled()
  })
})
