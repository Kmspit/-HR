import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
}))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

const createAuditLog = vi.fn().mockResolvedValue({ id: 'audit-1' })
vi.mock('@/lib/notifications', () => ({
  createAuditLog: (...a: unknown[]) => createAuditLog(...a),
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/users/[id]/sensitive/route'

function makeReq(id: string) {
  return new NextRequest(`http://localhost/api/users/${id}/sensitive`, {
    headers: { 'x-forwarded-for': '1.2.3.4' },
  })
}

const params = (id: string) => Promise.resolve({ id })

const hrSession      = { user: { id: 'hr-1', role: 'HR', branchId: 'b1' } }
const superAdminSession = { user: { id: 'admin-1', role: 'SUPER_ADMIN', branchId: 'b1' } }
const managerSession = { user: { id: 'mgr-1', role: 'MANAGER', branchId: 'b1' } }
const employeeSession = { user: { id: 'emp-1', role: 'EMPLOYEE', branchId: 'b1' } }

describe('GET /api/users/[id]/sensitive', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('HR_ADMIN role can call it and gets the user record, and a VIEW audit log is written', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'target-1', nationalId: '1234567890123' } as never)

    const res = await GET(makeReq('target-1'), { params: params('target-1') })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.user.nationalId).toBe('1234567890123')

    expect(createAuditLog).toHaveBeenCalledTimes(1)
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'hr-1',
        targetId: 'target-1',
        targetType: 'UserSensitiveData',
        action: 'VIEW',
        after: expect.objectContaining({ result: 'SUCCESS' }),
      }),
    )
  })

  it('another HR_ADMIN role (SUPER_ADMIN) can also call it', async () => {
    vi.mocked(auth).mockResolvedValue(superAdminSession as never)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'target-1', nationalId: '1234567890123' } as never)

    const res = await GET(makeReq('target-1'), { params: params('target-1') })
    expect(res.status).toBe(200)
  })

  it('MANAGER is forbidden — 403 — even though MANAGER can view a report elsewhere', async () => {
    vi.mocked(auth).mockResolvedValue(managerSession as never)

    const res = await GET(makeReq('target-1'), { params: params('target-1') })
    expect(res.status).toBe(403)
    expect(prisma.user.findUnique).not.toHaveBeenCalled() // never even reaches the DB read

    expect(createAuditLog).toHaveBeenCalledTimes(1)
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'mgr-1',
        targetId: 'target-1',
        targetType: 'UserSensitiveData',
        action: 'VIEW',
        after: expect.objectContaining({ result: 'FORBIDDEN', actorRole: 'MANAGER' }),
      }),
    )
  })

  it('plain EMPLOYEE is forbidden — 403 — and the attempt is still audit-logged', async () => {
    vi.mocked(auth).mockResolvedValue(employeeSession as never)

    const res = await GET(makeReq('target-1'), { params: params('target-1') })
    expect(res.status).toBe(403)
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'emp-1', action: 'VIEW', after: expect.objectContaining({ result: 'FORBIDDEN' }) }),
    )
  })

  it('unauthenticated request gets 401 and no audit log (no actor to attribute it to)', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    const res = await GET(makeReq('target-1'), { params: params('target-1') })
    expect(res.status).toBe(401)
    expect(createAuditLog).not.toHaveBeenCalled()
  })
})
