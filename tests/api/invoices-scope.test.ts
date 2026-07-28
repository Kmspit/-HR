import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    billingInvoice: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
    user:           { findUnique: vi.fn() },
  },
}))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

vi.mock('@/lib/utils', () => ({
  parseNonNegativeNumber: (v: unknown) => (typeof v === 'number' && v >= 0 ? v : null),
}))

vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GET as listGet } from '@/app/api/invoices/route'
import { GET as detailGet } from '@/app/api/invoices/[id]/route'

const params = Promise.resolve({ id: 'inv-1' })

const mgrSession    = { user: { id: 'mgr-1', role: 'MANAGER', branchId: null } }
const hrSession     = { user: { id: 'hr-1', role: 'MANAGER_HR', branchId: null } }
const clientSession = { user: { id: 'client-1', role: 'CLIENT', branchId: null } }

function getReq(url = 'http://localhost/api/invoices') {
  return new NextRequest(url)
}

describe('invoices — role gate fix (previously any authenticated user could see all invoices)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.billingInvoice.findMany).mockResolvedValue([])
    vi.mocked(prisma.billingInvoice.count).mockResolvedValue(0)
  })

  describe('list GET', () => {
    it('forbids a non-company-wide staff role (MANAGER)', async () => {
      vi.mocked(auth).mockResolvedValue(mgrSession as never)
      const res = await listGet(getReq())
      expect(res.status).toBe(403)
      expect(prisma.billingInvoice.findMany).not.toHaveBeenCalled()
    })

    it('allows a company-wide finance role (MANAGER_HR)', async () => {
      vi.mocked(auth).mockResolvedValue(hrSession as never)
      const res = await listGet(getReq())
      expect(res.status).toBe(200)
      expect(prisma.billingInvoice.findMany).toHaveBeenCalled()
    })

    it('still allows CLIENT through to the existing clientName-scoped query', async () => {
      vi.mocked(auth).mockResolvedValue(clientSession as never)
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'client-1', name: 'บริษัท เอ' } as never)
      const res = await listGet(getReq())
      expect(res.status).toBe(200)
      const call = vi.mocked(prisma.billingInvoice.findMany).mock.calls[0][0] as any
      expect(call.where.OR).toEqual([{ clientName: { contains: 'บริษัท เอ' } }])
    })
  })

  describe('single GET', () => {
    it('forbids a non-company-wide staff role (MANAGER)', async () => {
      vi.mocked(auth).mockResolvedValue(mgrSession as never)
      vi.mocked(prisma.billingInvoice.findUnique).mockResolvedValue({ id: 'inv-1', clientName: 'บริษัท เอ' } as never)
      const res = await detailGet(getReq(), { params })
      expect(res.status).toBe(403)
    })

    it('allows a company-wide finance role (MANAGER_HR)', async () => {
      vi.mocked(auth).mockResolvedValue(hrSession as never)
      vi.mocked(prisma.billingInvoice.findUnique).mockResolvedValue({ id: 'inv-1', clientName: 'บริษัท เอ' } as never)
      const res = await detailGet(getReq(), { params })
      expect(res.status).toBe(200)
    })

    it('forbids a CLIENT viewing an invoice that is not theirs (closes the same-class IDOR)', async () => {
      vi.mocked(auth).mockResolvedValue(clientSession as never)
      vi.mocked(prisma.billingInvoice.findUnique).mockResolvedValue({ id: 'inv-1', clientName: 'บริษัท บี' } as never)
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ name: 'บริษัท เอ' } as never)
      const res = await detailGet(getReq(), { params })
      expect(res.status).toBe(403)
    })

    it('allows a CLIENT viewing their own linked invoice', async () => {
      vi.mocked(auth).mockResolvedValue(clientSession as never)
      vi.mocked(prisma.billingInvoice.findUnique).mockResolvedValue({ id: 'inv-1', clientName: 'บริษัท เอ จำกัด' } as never)
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ name: 'บริษัท เอ' } as never)
      const res = await detailGet(getReq(), { params })
      expect(res.status).toBe(200)
    })
  })
})
