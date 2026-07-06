import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    outsideWorkRequest: {
      findMany:   vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      update:     vi.fn(),
    },
  },
}))

vi.mock('@/lib/notifications', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/outside-work/deleted/route'
import { POST } from '@/app/api/outside-work/[id]/restore/route'

const allowedSession = { user: { id: 'hr-1', name: 'HR Admin', role: 'MANAGER_HR' } }
const forbiddenSession = { user: { id: 'user-1', name: 'Employee', role: 'EMPLOYEE' } }
const adminForbiddenSession = { user: { id: 'admin-1', name: 'Admin', role: 'ADMIN' } }

describe('GET /api/outside-work/deleted', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const res = await GET(new NextRequest('http://localhost/api/outside-work/deleted'))
    expect(res.status).toBe(401)
  })

  it('returns 403 for EMPLOYEE (not in HR_STAFF_ROLES)', async () => {
    vi.mocked(auth).mockResolvedValue(forbiddenSession as never)
    const res = await GET(new NextRequest('http://localhost/api/outside-work/deleted'))
    expect(res.status).toBe(403)
  })

  it('returns 403 for ADMIN (excluded per this feature — more sensitive than client-companies)', async () => {
    vi.mocked(auth).mockResolvedValue(adminForbiddenSession as never)
    const res = await GET(new NextRequest('http://localhost/api/outside-work/deleted'))
    expect(res.status).toBe(403)
  })

  it('returns items for MANAGER_HR', async () => {
    vi.mocked(auth).mockResolvedValue(allowedSession as never)
    vi.mocked(prisma.outsideWorkRequest.findMany).mockResolvedValue([] as never)
    const res = await GET(new NextRequest('http://localhost/api/outside-work/deleted'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data.items)).toBe(true)
    expect(prisma.outsideWorkRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: { not: null } } }),
    )
  })

  it('filters by from/to date range when provided', async () => {
    vi.mocked(auth).mockResolvedValue(allowedSession as never)
    vi.mocked(prisma.outsideWorkRequest.findMany).mockResolvedValue([] as never)
    const req = new NextRequest('http://localhost/api/outside-work/deleted?from=2026-01-01&to=2026-01-31')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const call = vi.mocked(prisma.outsideWorkRequest.findMany).mock.calls[0][0] as never as { where: { deletedAt: { gte: Date; lte: Date } } }
    expect(call.where.deletedAt.gte).toBeInstanceOf(Date)
    expect(call.where.deletedAt.lte).toBeInstanceOf(Date)
  })
})

describe('POST /api/outside-work/[id]/restore', () => {
  beforeEach(() => vi.clearAllMocks())
  const params = Promise.resolve({ id: 'req-1' })

  function makeReq() {
    return new NextRequest('http://localhost/api/outside-work/req-1/restore', { method: 'POST' })
  }

  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const res = await POST(makeReq(), { params })
    expect(res.status).toBe(401)
  })

  it('returns 403 for EMPLOYEE', async () => {
    vi.mocked(auth).mockResolvedValue(forbiddenSession as never)
    const res = await POST(makeReq(), { params })
    expect(res.status).toBe(403)
    expect(prisma.outsideWorkRequest.update).not.toHaveBeenCalled()
  })

  it('returns 404 when request does not exist', async () => {
    vi.mocked(auth).mockResolvedValue(allowedSession as never)
    vi.mocked(prisma.outsideWorkRequest.findUnique).mockResolvedValue(null as never)
    const res = await POST(makeReq(), { params })
    expect(res.status).toBe(404)
  })

  it('returns 400 when the request is not deleted', async () => {
    vi.mocked(auth).mockResolvedValue(allowedSession as never)
    vi.mocked(prisma.outsideWorkRequest.findUnique).mockResolvedValue({ deletedAt: null } as never)
    const res = await POST(makeReq(), { params })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('รายการนี้ไม่ได้ถูกลบ')
    expect(prisma.outsideWorkRequest.update).not.toHaveBeenCalled()
  })

  it('restores a deleted request (clears deletedAt/deletedById)', async () => {
    vi.mocked(auth).mockResolvedValue(allowedSession as never)
    vi.mocked(prisma.outsideWorkRequest.findUnique).mockResolvedValue({ deletedAt: new Date('2026-01-01') } as never)
    vi.mocked(prisma.outsideWorkRequest.update).mockResolvedValue({ id: 'req-1' } as never)

    const res = await POST(makeReq(), { params })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(prisma.outsideWorkRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'req-1' },
        data: { deletedAt: null, deletedById: null },
      }),
    )
  })
})
