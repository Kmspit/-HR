import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    leaveRequest: {
      create:     vi.fn(),
      findMany:   vi.fn(),
      findUnique: vi.fn(),
      update:     vi.fn(),
      delete:     vi.fn(),
    },
    user:            { findUnique: vi.fn() },
    companyHoliday:  { findMany:   vi.fn().mockResolvedValue([]) },
    approvalChainConfig: { findFirst: vi.fn().mockResolvedValue(null) },
    leaveApprovalStep:   { create: vi.fn(), createMany: vi.fn() },
  },
}))

vi.mock('@/lib/ensure-db-schema', () => ({
  ensureDbSchema: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/notifications', () => ({
  notifyRole:      vi.fn().mockResolvedValue(undefined),
  sendLineNotify:  vi.fn().mockResolvedValue(undefined),
  createAuditLog:  vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/api-handler', () => ({
  apiError:   (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
  runNotify:  (fn: () => Promise<unknown>) => fn().catch(() => {}),
}))

vi.mock('@/lib/save-upload', () => ({ saveUpload: vi.fn().mockResolvedValue(null) }))

vi.mock('@/lib/company-holidays', () => ({
  findLeaveHolidayConflicts:   vi.fn().mockResolvedValue([]),
  formatHolidayConflictMessage: vi.fn().mockReturnValue(''),
  loadHolidaysForBranch:        vi.fn().mockResolvedValue([]),
  parseDateOnly:                (s: string) => new Date(s),
}))

vi.mock('@/lib/approval-chain', () => ({
  getDefaultChain:  vi.fn().mockResolvedValue(null),
  applyChainToLeave: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/line-notifications', () => ({
  sendLineApprovalRequest: vi.fn().mockResolvedValue(undefined),
}))

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getDefaultChain, applyChainToLeave } from '@/lib/approval-chain'
import { POST, GET } from '@/app/api/leave/route'

// ── Helpers ────────────────────────────────────────────────────────────────────

const mockSession = { user: { id: 'user-1', name: 'Employee', role: 'EMPLOYEE', branchId: 'branch-hq' } }

function makeJsonReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/leave', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validLeave = {
  type:      'SICK',
  startDate: '2026-07-01',
  endDate:   '2026-07-01',
  days:      1,
  reason:    'ไม่สบาย',
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('POST /api/leave', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const res = await POST(makeJsonReq(validLeave))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid leave type', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never)
    const res = await POST(makeJsonReq({ ...validLeave, type: 'INVALID_TYPE' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when days is 0', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never)
    const res = await POST(makeJsonReq({ ...validLeave, days: 0 }))
    expect(res.status).toBe(400)
  })

  it('returns 409 when no approval chain configured', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never)
    const created = { id: 'leave-1', ...validLeave, userId: 'user-1', status: 'PENDING', user: { name: 'Employee' } }
    vi.mocked(prisma.leaveRequest.create).mockResolvedValue(created as never)
    vi.mocked(getDefaultChain).mockResolvedValue(null)

    const res = await POST(makeJsonReq(validLeave))
    expect(res.status).toBe(409)
    expect(prisma.leaveRequest.delete).toHaveBeenCalledWith({ where: { id: 'leave-1' } })
  })

  it('creates leave request and returns 200', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never)
    const created = { id: 'leave-1', ...validLeave, userId: 'user-1', status: 'PENDING', user: { name: 'Employee' } }
    vi.mocked(prisma.leaveRequest.create).mockResolvedValue(created as never)
    vi.mocked(getDefaultChain).mockResolvedValue({ id: 'chain-1' } as never)

    const res = await POST(makeJsonReq(validLeave))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.id).toBeTruthy()
    expect(applyChainToLeave).toHaveBeenCalled()
  })
})

describe('GET /api/leave', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const req = new NextRequest('http://localhost/api/leave')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns leave list for authenticated user', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never)
    vi.mocked(prisma.leaveRequest.findMany).mockResolvedValue([] as never)
    const req = new NextRequest('http://localhost/api/leave')
    const res = await GET(req)
    expect(res.status).toBe(200)
  })
})
