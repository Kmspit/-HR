import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    outsideWorkRequest: {
      create:     vi.fn(),
      findMany:   vi.fn(),
      findUnique: vi.fn(),
      update:     vi.fn(),
    },
  },
}))

vi.mock('@/lib/notifications', () => ({
  notifyRole:      vi.fn().mockResolvedValue(undefined),
  createAuditLog:  vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/api-handler', () => ({
  apiError:   (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
  runNotify:  (fn: () => Promise<unknown>) => fn().catch(() => {}),
}))

vi.mock('@/lib/rbac', () => ({
  hasPermission: vi.fn((role: string, _perm: string) => role === 'CEO' || role === 'ADMIN'),
}))

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { POST, GET } from '@/app/api/outside-work/route'
import { PATCH } from '@/app/api/outside-work/[id]/route'

// ── Helpers ────────────────────────────────────────────────────────────────────

const mockSession = { user: { id: 'user-1', name: 'Test User', role: 'EMPLOYEE' } }
const mockHrSession = { user: { id: 'hr-1', name: 'HR Admin', role: 'CEO' } }

function makePostReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/outside-work', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makePatchReq(id: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/outside-work/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validPayload = {
  date:      '2026-06-23',
  startTime: '09:00',
  endTime:   '17:00',
  place:     'ศาลจังหวัด',
  purpose:   'ยื่นฟ้อง',
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('POST /api/outside-work', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const res = await POST(makePostReq(validPayload))
    expect(res.status).toBe(401)
  })

  it('returns 400 when required fields are missing', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never)
    const res = await POST(makePostReq({ date: '2026-06-23' }))
    expect(res.status).toBe(400)
  })

  it('creates outside-work request and returns 200', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never)
    const created = { id: 'req-1', ...validPayload, userId: 'user-1', status: 'PENDING', approvalStatus: 'pending_ceo' }
    vi.mocked(prisma.outsideWorkRequest.create).mockResolvedValue(created as never)

    const res = await POST(makePostReq(validPayload))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.request.id).toBe('req-1')
    expect(prisma.outsideWorkRequest.create).toHaveBeenCalledOnce()
  })
})

describe('GET /api/outside-work', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const req = new NextRequest('http://localhost/api/outside-work')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns requests for authenticated employee', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never)
    vi.mocked(prisma.outsideWorkRequest.findMany).mockResolvedValue([] as never)
    const req = new NextRequest('http://localhost/api/outside-work')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data.requests)).toBe(true)
  })
})

describe('PATCH /api/outside-work/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  const existing = {
    id: 'req-1', userId: 'user-1', status: 'PENDING',
    approvalStatus: 'pending_ceo', place: 'ศาลจังหวัด',
  }
  const params = Promise.resolve({ id: 'req-1' })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const res = await PATCH(makePatchReq('req-1', { place: 'อาคารใหม่' }), { params })
    expect(res.status).toBe(401)
  })

  it('allows owner to edit their PENDING request', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never)
    vi.mocked(prisma.outsideWorkRequest.findUnique).mockResolvedValue(existing as never)
    vi.mocked(prisma.outsideWorkRequest.update).mockResolvedValue({ ...existing, place: 'อาคารใหม่' } as never)

    const res = await PATCH(makePatchReq('req-1', { place: 'อาคารใหม่' }), { params })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })

  it('allows HR to approve by setting approvalStatus', async () => {
    vi.mocked(auth).mockResolvedValue(mockHrSession as never)
    vi.mocked(prisma.outsideWorkRequest.findUnique).mockResolvedValue(existing as never)
    vi.mocked(prisma.outsideWorkRequest.update).mockResolvedValue({
      ...existing, approvalStatus: 'approved_by_ceo', status: 'APPROVED',
    } as never)

    const res = await PATCH(
      makePatchReq('req-1', { approvalStatus: 'approved_by_ceo', status: 'APPROVED' }),
      { params },
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(prisma.outsideWorkRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ approvalStatus: 'approved_by_ceo' }),
      }),
    )
  })

  it('forbids non-owner non-HR from editing', async () => {
    const otherUser = { user: { id: 'other-user', name: 'Other', role: 'EMPLOYEE' } }
    vi.mocked(auth).mockResolvedValue(otherUser as never)
    vi.mocked(prisma.outsideWorkRequest.findUnique).mockResolvedValue(existing as never)

    const res = await PATCH(makePatchReq('req-1', { place: 'อาคารใหม่' }), { params })
    expect(res.status).toBe(403)
  })
})
