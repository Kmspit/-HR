import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/api-guard', () => ({
  requireOrgScope: vi.fn(),
  isGuardResponse: (v: unknown) => v instanceof Response,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    securityDepositPlan: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

vi.mock('@/lib/notifications', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/ensure-payroll-fields-batch-2', () => ({
  ensurePayrollFieldsBatch2: vi.fn().mockResolvedValue(undefined),
}))

import { requireOrgScope } from '@/lib/api-guard'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/notifications'
import { GET, POST, PATCH } from '@/app/api/users/[id]/security-deposit/route'

function makeReq(method: string, body?: Record<string, unknown>) {
  return new NextRequest('http://localhost/x', {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}
const params = (id: string) => Promise.resolve({ id })
const hrSession = { user: { id: 'hr-1', role: 'HR', branchId: 'b1' } }
const managerSession = { user: { id: 'mgr-1', role: 'MANAGER', branchId: 'b1' } }

const validBody = { totalAmount: 6000, totalInstallments: 6, startMonth: 9, startYear: 2026 }

describe('GET /api/users/[id]/security-deposit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireOrgScope).mockResolvedValue(hrSession as never)
  })

  it('rejects a MANAGER (not HR_ADMIN)', async () => {
    vi.mocked(requireOrgScope).mockResolvedValue(managerSession as never)
    const res = await GET(makeReq('GET'), { params: params('emp-1') })
    expect(res.status).toBe(403)
  })

  it('returns null when no plan exists', async () => {
    vi.mocked(prisma.securityDepositPlan.findUnique).mockResolvedValue(null)
    const res = await GET(makeReq('GET'), { params: params('emp-1') })
    expect(res.status).toBe(200)
    expect((await res.json()).plan).toBeNull()
  })
})

describe('POST /api/users/[id]/security-deposit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireOrgScope).mockResolvedValue(hrSession as never)
  })

  it('rejects a MANAGER', async () => {
    vi.mocked(requireOrgScope).mockResolvedValue(managerSession as never)
    const res = await POST(makeReq('POST', validBody), { params: params('emp-1') })
    expect(res.status).toBe(403)
    expect(prisma.securityDepositPlan.create).not.toHaveBeenCalled()
  })

  it('rejects totalAmount <= 0', async () => {
    vi.mocked(prisma.securityDepositPlan.findUnique).mockResolvedValue(null)
    const res = await POST(makeReq('POST', { ...validBody, totalAmount: 0 }), { params: params('emp-1') })
    expect(res.status).toBe(400)
  })

  it('rejects a non-integer totalInstallments', async () => {
    vi.mocked(prisma.securityDepositPlan.findUnique).mockResolvedValue(null)
    const res = await POST(makeReq('POST', { ...validBody, totalInstallments: 2.5 }), { params: params('emp-1') })
    expect(res.status).toBe(400)
  })

  it('rejects creating a new plan while an ACTIVE one already exists', async () => {
    vi.mocked(prisma.securityDepositPlan.findUnique).mockResolvedValue({ id: 'p1', status: 'ACTIVE' } as never)
    const res = await POST(makeReq('POST', validBody), { params: params('emp-1') })
    expect(res.status).toBe(400)
    expect(prisma.securityDepositPlan.create).not.toHaveBeenCalled()
  })

  it('creates a new plan when none exists, and audit-logs it', async () => {
    vi.mocked(prisma.securityDepositPlan.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.securityDepositPlan.create).mockResolvedValue({ id: 'p1', ...validBody, status: 'ACTIVE' } as never)

    const res = await POST(makeReq('POST', validBody), { params: params('emp-1') })
    expect(res.status).toBe(200)
    expect(prisma.securityDepositPlan.create).toHaveBeenCalledWith({
      data: { userId: 'emp-1', ...validBody, status: 'ACTIVE' },
    })
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE' }))
  })

  it('re-creates (update) a plan when a previous CANCELLED one exists for this user', async () => {
    vi.mocked(prisma.securityDepositPlan.findUnique).mockResolvedValue({ id: 'p1', status: 'CANCELLED' } as never)
    vi.mocked(prisma.securityDepositPlan.update).mockResolvedValue({ id: 'p1', ...validBody, status: 'ACTIVE' } as never)

    const res = await POST(makeReq('POST', validBody), { params: params('emp-1') })
    expect(res.status).toBe(200)
    expect(prisma.securityDepositPlan.update).toHaveBeenCalledWith({
      where: { userId: 'emp-1' },
      data: { ...validBody, status: 'ACTIVE' },
    })
  })
})

describe('PATCH /api/users/[id]/security-deposit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireOrgScope).mockResolvedValue(hrSession as never)
  })

  it('rejects a status other than CANCELLED', async () => {
    const res = await PATCH(makeReq('PATCH', { status: 'ACTIVE' }), { params: params('emp-1') })
    expect(res.status).toBe(400)
  })

  it('404s when no plan exists to cancel', async () => {
    vi.mocked(prisma.securityDepositPlan.findUnique).mockResolvedValue(null)
    const res = await PATCH(makeReq('PATCH', { status: 'CANCELLED' }), { params: params('emp-1') })
    expect(res.status).toBe(404)
  })

  it('cancels an existing plan and audit-logs it', async () => {
    vi.mocked(prisma.securityDepositPlan.findUnique).mockResolvedValue({ id: 'p1', status: 'ACTIVE' } as never)
    vi.mocked(prisma.securityDepositPlan.update).mockResolvedValue({ id: 'p1', status: 'CANCELLED' } as never)

    const res = await PATCH(makeReq('PATCH', { status: 'CANCELLED' }), { params: params('emp-1') })
    expect(res.status).toBe(200)
    expect(prisma.securityDepositPlan.update).toHaveBeenCalledWith({
      where: { userId: 'emp-1' },
      data: { status: 'CANCELLED' },
    })
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE' }))
  })
})
