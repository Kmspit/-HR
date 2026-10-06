import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/api-guard', () => ({
  requireRoles: vi.fn(),
  isGuardResponse: (v: unknown) => v instanceof Response,
}))

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  deleteMany: vi.fn(),
  upsert: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    pagePermissionOverride: { findMany: mocks.findMany, deleteMany: mocks.deleteMany, upsert: mocks.upsert },
    user: { findUnique: mocks.findUnique },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({ pagePermissionOverride: { deleteMany: mocks.deleteMany, upsert: mocks.upsert } }),
    ),
  },
}))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

vi.mock('@/lib/notifications', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}))

const { clearCacheMock } = vi.hoisted(() => ({ clearCacheMock: vi.fn() }))
vi.mock('@/lib/user-page-permissions-cache', () => ({
  clearUserPagePermissionsCache: clearCacheMock,
}))

import { requireRoles } from '@/lib/api-guard'
import { createAuditLog } from '@/lib/notifications'
import { GET, PUT } from '@/app/api/users/[id]/page-permissions/route'

const hrManagerSession = { user: { id: 'manager-1', name: 'ผจก.', role: 'MANAGER_HR' } }
const params = (id: string) => ({ params: Promise.resolve({ id }) })

function makePut(id: string, body: unknown) {
  return new NextRequest(`http://localhost/api/users/${id}/page-permissions`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}
function makeGet(id: string) {
  return new NextRequest(`http://localhost/api/users/${id}/page-permissions`)
}

describe('GET /api/users/[id]/page-permissions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('403 for a role outside SUPER_ADMIN/CEO/MANAGER_HR (requireRoles denies)', async () => {
    vi.mocked(requireRoles).mockResolvedValue(new Response(null, { status: 403 }) as any)
    const res = await GET(makeGet('u1'), params('u1'))
    expect(res.status).toBe(403)
  })

  it('200 returns the current overrides for MANAGER_HR', async () => {
    vi.mocked(requireRoles).mockResolvedValue(hrManagerSession as any)
    mocks.findMany.mockResolvedValue([{ path: '/payroll', direction: 'GRANT', reason: null, createdAt: new Date(), updatedAt: new Date() }])
    const res = await GET(makeGet('u1'), params('u1'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.overrides).toHaveLength(1)
    expect(data.overrides[0].path).toBe('/payroll')
  })
})

describe('PUT /api/users/[id]/page-permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireRoles).mockResolvedValue(hrManagerSession as any)
    mocks.findUnique.mockResolvedValue({ id: 'u1' })
    mocks.findMany.mockResolvedValue([])
  })

  it('403 self-override attempt — even for a trusted OVERRIDE_MANAGER_ROLES actor', async () => {
    const res = await PUT(makePut('manager-1', { overrides: [{ path: '/payroll', direction: 'GRANT' }] }), params('manager-1'))
    expect(res.status).toBe(403)
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ after: expect.objectContaining({ pagePermissionOverrideChangeBlocked: true }) }),
    )
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it('400 for a path not in OVERRIDE_ELIGIBLE_PATHS', async () => {
    const res = await PUT(makePut('u1', { overrides: [{ path: '/settings', direction: 'GRANT' }] }), params('u1'))
    expect(res.status).toBe(400)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it('400 for a malformed body', async () => {
    const res = await PUT(makePut('u1', { not: 'an overrides array' }), params('u1'))
    expect(res.status).toBe(400)
  })

  it('404 for a non-existent target user', async () => {
    mocks.findUnique.mockResolvedValue(null)
    const res = await PUT(makePut('ghost', { overrides: [] }), params('ghost'))
    expect(res.status).toBe(404)
  })

  it('successful PUT: deletes rows no longer present, upserts the rest, clears cache, writes an audit diff', async () => {
    mocks.findMany
      .mockResolvedValueOnce([{ path: '/reports', direction: 'RESTRICT' }]) // "before" snapshot
      .mockResolvedValueOnce([{ path: '/payroll', direction: 'GRANT', reason: null }]) // final re-read for response

    const res = await PUT(
      makePut('u1', { overrides: [{ path: '/payroll', direction: 'GRANT', reason: 'มอบหมายพิเศษ' }] }),
      params('u1'),
    )

    expect(res.status).toBe(200)
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', path: { notIn: ['/payroll'] } } })
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_path: { userId: 'u1', path: '/payroll' } },
        update: expect.objectContaining({ direction: 'GRANT', reason: 'มอบหมายพิเศษ' }),
      }),
    )
    expect(clearCacheMock).toHaveBeenCalledWith('u1')
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({
          subrecordEvent: true,
          entityType: 'PagePermissionOverride',
          lines: expect.arrayContaining([expect.stringContaining('/reports'), expect.stringContaining('/payroll')]),
        }),
      }),
    )
  })

  it('no audit log written when nothing actually changed', async () => {
    mocks.findMany
      .mockResolvedValueOnce([{ path: '/payroll', direction: 'GRANT' }])
      .mockResolvedValueOnce([{ path: '/payroll', direction: 'GRANT', reason: null }])

    await PUT(makePut('u1', { overrides: [{ path: '/payroll', direction: 'GRANT' }] }), params('u1'))

    expect(createAuditLog).not.toHaveBeenCalled()
  })
})
