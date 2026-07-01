import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    outsideWorkRequest: {
      findUnique: vi.fn(),
      update:     vi.fn(),
    },
  },
}))

vi.mock('@/lib/notifications', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  notifyRole:     vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

vi.mock('@/lib/access-control', () => ({
  hasPermission: vi.fn((role: string, perm: string) => {
    if (perm === 'approve_outside_work') return ['CEO', 'HR', 'MANAGER_HR'].includes(role)
    return false
  }),
}))

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GET, PATCH } from '@/app/api/outside-work/[id]/route'

// ── Helpers ────────────────────────────────────────────────────────────────────

const hrSession  = { user: { id: 'hr-1',   name: 'HR Admin',   role: 'HR' } }
const empSession = { user: { id: 'emp-1',  name: 'Employee',   role: 'EMPLOYEE' } }

const mockRequest = {
  id: 'req-1', userId: 'emp-1', status: 'PENDING', approvalStatus: null,
  place: 'สำนักงานลูกค้า', purpose: 'ประชุม', startTime: '09:00', endTime: '17:00',
  date: new Date('2025-01-15'), note: null,
}

function makePatch(id: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/outside-work/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('GET /api/outside-work/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await GET(
      new NextRequest('http://localhost/api/outside-work/req-1'),
      { params: Promise.resolve({ id: 'req-1' }) },
    )
    expect(res.status).toBe(401)
  })

  it('returns 404 when request not found', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.outsideWorkRequest.findUnique).mockResolvedValue(null as any)
    const res = await GET(
      new NextRequest('http://localhost/api/outside-work/missing'),
      { params: Promise.resolve({ id: 'missing' }) },
    )
    expect(res.status).toBe(404)
  })

  it('returns 403 when employee views another employee request', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'other-emp', role: 'EMPLOYEE' } } as any)
    vi.mocked(prisma.outsideWorkRequest.findUnique).mockResolvedValue({
      ...mockRequest,
      user: { name: 'Employee', department: 'IT', position: 'Dev' },
      approvals: [],
    } as any)
    const res = await GET(
      new NextRequest('http://localhost/api/outside-work/req-1'),
      { params: Promise.resolve({ id: 'req-1' }) },
    )
    expect(res.status).toBe(403)
  })

  it('returns request when HR views', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.outsideWorkRequest.findUnique).mockResolvedValue({
      ...mockRequest,
      user: { name: 'Employee', department: 'IT', position: 'Dev' },
      approvals: [],
    } as any)
    const res = await GET(
      new NextRequest('http://localhost/api/outside-work/req-1'),
      { params: Promise.resolve({ id: 'req-1' }) },
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.request).toBeDefined()
  })
})

describe('PATCH /api/outside-work/[id] — approve/reject', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await PATCH(makePatch('req-1', { status: 'APPROVED' }), {
      params: Promise.resolve({ id: 'req-1' }),
    })
    expect(res.status).toBe(401)
  })

  it('allows HR to approve (set status)', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.outsideWorkRequest.findUnique).mockResolvedValue(mockRequest as any)
    vi.mocked(prisma.outsideWorkRequest.update).mockResolvedValue({
      ...mockRequest, status: 'APPROVED',
    } as any)

    const res = await PATCH(makePatch('req-1', { status: 'APPROVED' }), {
      params: Promise.resolve({ id: 'req-1' }),
    })
    expect(res.status).toBe(200)
    expect(prisma.outsideWorkRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'req-1' } }),
    )
  })

  it('allows HR to reject with approvalStatus', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    vi.mocked(prisma.outsideWorkRequest.findUnique).mockResolvedValue(mockRequest as any)
    vi.mocked(prisma.outsideWorkRequest.update).mockResolvedValue({
      ...mockRequest, approvalStatus: 'rejected_by_ceo',
    } as any)

    const res = await PATCH(makePatch('req-1', { approvalStatus: 'rejected_by_ceo' }), {
      params: Promise.resolve({ id: 'req-1' }),
    })
    expect(res.status).toBe(200)
  })

  it('returns 403 when employee tries to approve their own request', async () => {
    vi.mocked(auth).mockResolvedValue(empSession as any)
    vi.mocked(prisma.outsideWorkRequest.findUnique).mockResolvedValue(mockRequest as any)

    const res = await PATCH(makePatch('req-1', { status: 'APPROVED' }), {
      params: Promise.resolve({ id: 'req-1' }),
    })
    expect(res.status).toBe(403)
  })

  it('allows owner to edit their PENDING request', async () => {
    vi.mocked(auth).mockResolvedValue(empSession as any)
    vi.mocked(prisma.outsideWorkRequest.findUnique).mockResolvedValue(mockRequest as any)
    vi.mocked(prisma.outsideWorkRequest.update).mockResolvedValue({
      ...mockRequest, place: 'สถานที่ใหม่',
    } as any)

    const res = await PATCH(makePatch('req-1', { place: 'สถานที่ใหม่' }), {
      params: Promise.resolve({ id: 'req-1' }),
    })
    expect(res.status).toBe(200)
  })

  it('returns 403 when employee edits approved request', async () => {
    vi.mocked(auth).mockResolvedValue(empSession as any)
    vi.mocked(prisma.outsideWorkRequest.findUnique).mockResolvedValue({
      ...mockRequest, status: 'APPROVED', approvalStatus: null,
    } as any)

    const res = await PATCH(makePatch('req-1', { place: 'สถานที่ใหม่' }), {
      params: Promise.resolve({ id: 'req-1' }),
    })
    expect(res.status).toBe(403)
  })
})
