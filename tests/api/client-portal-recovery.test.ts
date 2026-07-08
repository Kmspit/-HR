import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

const portalSession = {
  ok: true,
  session: { portalUserId: 'portal-user-1', clientCompanyId: 'company-1' },
}
const requireActivePortalSession = vi.fn()
vi.mock('@/lib/portal-session-guard', () => ({
  requireActivePortalSession: (...a: unknown[]) => requireActivePortalSession(...a),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    caseClient:       { findMany: vi.fn(), findFirst: vi.fn() },
    case:             { findUnique: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
    recoveryPayment:  { aggregate: vi.fn(), findMany: vi.fn() },
    courtEvent:       { count: vi.fn() },
    caseDebtor:       { count: vi.fn() },
    clientPortalLog:  { create: vi.fn().mockResolvedValue({}) },
  },
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma'
import { GET as caseDetailGet } from '@/app/api/client-portal/cases/[id]/route'
import { GET as dashboardGet } from '@/app/api/client-portal/dashboard/route'

describe('Client-portal recovery totals filter on the status the app actually writes (CONFIRMED, not RECEIVED)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireActivePortalSession.mockResolvedValue(portalSession)
  })

  it('GET /api/client-portal/cases/[id] queries recoveryPayments with status CONFIRMED', async () => {
    vi.mocked(prisma.caseClient.findFirst).mockResolvedValue({ caseId: 'case-1' } as never)
    vi.mocked(prisma.case.findUnique).mockResolvedValue({
      id: 'case-1', caseNumber: 'KM-1', caseTitle: 't', status: 'NEW', caseType: 'x', priority: 'MEDIUM',
      description: null, debtAmount: 1000, createdAt: new Date(), updatedAt: new Date(),
      debtor: null, assignedEmployee: null, timeline: [], courtEvents: [],
      recoveryPayments: [{ id: 'p1', amount: 500, paymentDate: new Date(), paymentType: 'CASH', status: 'CONFIRMED' }],
    } as never)

    const req = new NextRequest('http://localhost/api/client-portal/cases/case-1')
    const res = await caseDetailGet(req, { params: Promise.resolve({ id: 'case-1' }) })
    expect(res.status).toBe(200)

    expect(prisma.case.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          recoveryPayments: expect.objectContaining({
            where: { status: 'CONFIRMED' },
          }),
        }),
      }),
    )

    const data = await res.json()
    expect(data.recoveryTotal).toBe(500)
  })

  it('GET /api/client-portal/dashboard aggregates recoveryPayment with status CONFIRMED', async () => {
    vi.mocked(prisma.caseClient.findMany).mockResolvedValue([{ caseId: 'case-1' }] as never)
    vi.mocked(prisma.case.count).mockResolvedValue(1 as never)
    vi.mocked(prisma.recoveryPayment.aggregate).mockResolvedValue({ _sum: { amount: 2500 } } as never)
    vi.mocked(prisma.case.aggregate).mockResolvedValue({ _sum: { debtAmount: 5000 } } as never)
    vi.mocked(prisma.courtEvent.count).mockResolvedValue(0 as never)
    vi.mocked(prisma.recoveryPayment.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.caseDebtor.count).mockResolvedValue(0 as never)

    const req = new NextRequest('http://localhost/api/client-portal/dashboard')
    const res = await dashboardGet(req)
    expect(res.status).toBe(200)

    expect(prisma.recoveryPayment.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'CONFIRMED' }) }),
    )

    const data = await res.json()
    expect(data.totalRecovery).toBe(2500)
    expect(data.collectionRate).toBe(50)
  })
})
