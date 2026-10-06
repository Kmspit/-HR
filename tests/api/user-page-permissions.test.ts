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
const ceoSession = { user: { id: 'ceo-1', name: 'CEO', role: 'CEO' } }
const superAdminSession = { user: { id: 'super-1', name: 'Super Admin', role: 'SUPER_ADMIN' } }
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
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findUnique.mockResolvedValue({ role: 'EMPLOYEE' })
  })

  it('403 for a role outside SUPER_ADMIN/CEO/MANAGER_HR (requireRoles denies)', async () => {
    vi.mocked(requireRoles).mockResolvedValue(new Response(null, { status: 403 }) as any)
    const res = await GET(makeGet('u1'), params('u1'))
    expect(res.status).toBe(403)
  })

  it('200 returns the current overrides for MANAGER_HR viewing an EMPLOYEE target', async () => {
    vi.mocked(requireRoles).mockResolvedValue(hrManagerSession as any)
    mocks.findMany.mockResolvedValue([{ path: '/payroll', direction: 'GRANT', reason: null, createdAt: new Date(), updatedAt: new Date() }])
    const res = await GET(makeGet('u1'), params('u1'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.overrides).toHaveLength(1)
    expect(data.overrides[0].path).toBe('/payroll')
  })

  it('404 when the target does not exist', async () => {
    vi.mocked(requireRoles).mockResolvedValue(hrManagerSession as any)
    mocks.findUnique.mockResolvedValue(null)
    const res = await GET(makeGet('ghost'), params('ghost'))
    expect(res.status).toBe(404)
  })

  /**
   * 2026-10-09 security review finding — GET had NO role-hierarchy check at
   * all (unlike PUT, which already had one from the 2026-10-06 round): a
   * MANAGER_HR could read a CEO's or another MANAGER_HR's overrides despite
   * being unable to edit them. Fixed by reusing the same canAssignRole()
   * check PUT already uses.
   */
  it('403: MANAGER_HR cannot GET a CEO target\'s overrides — same canAssignRole() hierarchy as PUT', async () => {
    vi.mocked(requireRoles).mockResolvedValue(hrManagerSession as any)
    mocks.findUnique.mockResolvedValue({ role: 'CEO' })

    const res = await GET(makeGet('ceo-target'), params('ceo-target'))

    expect(res.status).toBe(403)
    expect(mocks.findMany).not.toHaveBeenCalled()
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({
          pagePermissionOverrideReadBlocked: true,
          reason: 'target role outranks or equals actor',
          attemptedByRole: 'MANAGER_HR',
          targetRole: 'CEO',
        }),
      }),
    )
  })

  it('403: MANAGER_HR cannot GET another MANAGER_HR\'s overrides — equal rank also blocked', async () => {
    vi.mocked(requireRoles).mockResolvedValue(hrManagerSession as any)
    mocks.findUnique.mockResolvedValue({ role: 'MANAGER_HR' })

    const res = await GET(makeGet('peer-manager'), params('peer-manager'))

    expect(res.status).toBe(403)
  })

  it('CEO CAN GET a MANAGER_HR target\'s overrides (strictly lower rank)', async () => {
    vi.mocked(requireRoles).mockResolvedValue(ceoSession as any)
    mocks.findUnique.mockResolvedValue({ role: 'MANAGER_HR' })
    mocks.findMany.mockResolvedValue([])

    const res = await GET(makeGet('mgr-target'), params('mgr-target'))

    expect(res.status).toBe(200)
  })

  it('SUPER_ADMIN is exempt from the rank check — can GET even a CEO\'s or another SUPER_ADMIN\'s overrides', async () => {
    vi.mocked(requireRoles).mockResolvedValue(superAdminSession as any)
    mocks.findUnique.mockResolvedValue({ role: 'SUPER_ADMIN' })
    mocks.findMany.mockResolvedValue([])

    const res = await GET(makeGet('other-super'), params('other-super'))

    expect(res.status).toBe(200)
  })
})

describe('PUT /api/users/[id]/page-permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireRoles).mockResolvedValue(hrManagerSession as any)
    mocks.findUnique.mockResolvedValue({ id: 'u1', role: 'EMPLOYEE' })
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
    // CEO (not the default MANAGER_HR session) — MANAGER_HR can't GRANT
    // /executive (lacks EXEC_ONLY by default), and /executive is the only
    // eligible path since 2026-10-09 (see lib/override-eligible-paths.ts).
    vi.mocked(requireRoles).mockResolvedValue(ceoSession as any)
    mocks.findMany
      .mockResolvedValueOnce([{ path: '/executive', direction: 'RESTRICT' }]) // "before" snapshot
      .mockResolvedValueOnce([{ path: '/executive', direction: 'GRANT', reason: null }]) // final re-read for response

    const res = await PUT(
      makePut('u1', { overrides: [{ path: '/executive', direction: 'GRANT', reason: 'มอบหมายพิเศษ' }] }),
      params('u1'),
    )

    expect(res.status).toBe(200)
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', path: { notIn: ['/executive'] } } })
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_path: { userId: 'u1', path: '/executive' } },
        update: expect.objectContaining({ direction: 'GRANT', reason: 'มอบหมายพิเศษ' }),
      }),
    )
    expect(clearCacheMock).toHaveBeenCalledWith('u1')
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({
          subrecordEvent: true,
          entityType: 'PagePermissionOverride',
          lines: expect.arrayContaining([expect.stringContaining('/executive')]),
        }),
      }),
    )
  })

  it('no audit log written when nothing actually changed', async () => {
    vi.mocked(requireRoles).mockResolvedValue(ceoSession as any)
    mocks.findMany
      .mockResolvedValueOnce([{ path: '/executive', direction: 'GRANT' }])
      .mockResolvedValueOnce([{ path: '/executive', direction: 'GRANT', reason: null }])

    await PUT(makePut('u1', { overrides: [{ path: '/executive', direction: 'GRANT' }] }), params('u1'))

    expect(createAuditLog).not.toHaveBeenCalled()
  })

  /**
   * 2026-10-09 — /payroll and /reports temporarily removed from
   * OVERRIDE_ELIGIBLE_PATHS (branch-scoping gap, see lib/override-eligible-
   * paths.ts). Regression guard: both must now be flatly rejected, same as
   * any other non-curated path, regardless of direction or actor role.
   */
  it('400 for /payroll and /reports — no longer eligible paths', async () => {
    const res1 = await PUT(makePut('u1', { overrides: [{ path: '/payroll', direction: 'GRANT' }] }), params('u1'))
    expect(res1.status).toBe(400)
    const res2 = await PUT(makePut('u1', { overrides: [{ path: '/reports', direction: 'RESTRICT' }] }), params('u1'))
    expect(res2.status).toBe(400)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
})

/**
 * 2026-10-06 security review — two anti-privilege-escalation checks added to
 * PUT after an independent audit found: (a) nothing stopped an actor from
 * GRANTing a path their own role doesn't have by default (e.g. MANAGER_HR
 * granting /executive despite never having it itself — a privilege-
 * delegation gap), and (b) nothing stopped an actor from creating/editing an
 * override for a target who outranks them (e.g. MANAGER_HR editing a CEO's
 * overrides).
 */
describe('PUT /api/users/[id]/page-permissions — anti-privilege-escalation (2026-10-06)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findMany.mockResolvedValue([])
  })

  it('403: MANAGER_HR cannot GRANT /executive — MANAGER_HR itself lacks EXEC_ONLY by default', async () => {
    vi.mocked(requireRoles).mockResolvedValue(hrManagerSession as any)
    mocks.findUnique.mockResolvedValue({ id: 'u1', role: 'EMPLOYEE' })

    const res = await PUT(makePut('u1', { overrides: [{ path: '/executive', direction: 'GRANT' }] }), params('u1'))

    expect(res.status).toBe(403)
    expect(mocks.upsert).not.toHaveBeenCalled()
    // Blocked before the target-role lookup even matters for this check —
    // findUnique for the target should not need to have been consulted yet.
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({
          pagePermissionOverrideChangeBlocked: true,
          reason: 'actor lacks default access to the path being granted',
          attemptedPath: '/executive',
        }),
      }),
    )
  })

  it('403: MANAGER_HR cannot create/edit an override for a CEO target — outranks the actor', async () => {
    vi.mocked(requireRoles).mockResolvedValue(hrManagerSession as any)
    mocks.findUnique.mockResolvedValue({ id: 'ceo-target', role: 'CEO' })

    const res = await PUT(makePut('ceo-target', { overrides: [{ path: '/executive', direction: 'RESTRICT' }] }), params('ceo-target'))

    expect(res.status).toBe(403)
    expect(mocks.upsert).not.toHaveBeenCalled()
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({
          pagePermissionOverrideChangeBlocked: true,
          reason: 'target role outranks or equals actor',
          attemptedByRole: 'MANAGER_HR',
          targetRole: 'CEO',
        }),
      }),
    )
  })

  it('403: MANAGER_HR cannot create/edit an override for ANOTHER MANAGER_HR — equal rank is also blocked, not just higher', async () => {
    vi.mocked(requireRoles).mockResolvedValue(hrManagerSession as any)
    mocks.findUnique.mockResolvedValue({ id: 'peer-manager', role: 'MANAGER_HR' })

    const res = await PUT(makePut('peer-manager', { overrides: [{ path: '/executive', direction: 'RESTRICT' }] }), params('peer-manager'))

    expect(res.status).toBe(403)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it('CEO cannot create/edit an override for a SUPER_ADMIN target', async () => {
    vi.mocked(requireRoles).mockResolvedValue(ceoSession as any)
    mocks.findUnique.mockResolvedValue({ id: 'super-target', role: 'SUPER_ADMIN' })

    const res = await PUT(makePut('super-target', { overrides: [{ path: '/executive', direction: 'RESTRICT' }] }), params('super-target'))

    expect(res.status).toBe(403)
  })

  it('CEO CAN create/edit an override for a MANAGER_HR target (strictly lower rank)', async () => {
    vi.mocked(requireRoles).mockResolvedValue(ceoSession as any)
    mocks.findUnique.mockResolvedValue({ id: 'mgr-target', role: 'MANAGER_HR' })
    mocks.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    const res = await PUT(makePut('mgr-target', { overrides: [{ path: '/executive', direction: 'GRANT' }] }), params('mgr-target'))

    expect(res.status).toBe(200)
    expect(mocks.upsert).toHaveBeenCalledTimes(1)
  })

  it('SUPER_ADMIN is exempt from the rank check — can edit even a CEO or another SUPER_ADMIN\'s overrides', async () => {
    vi.mocked(requireRoles).mockResolvedValue(superAdminSession as any)
    mocks.findUnique.mockResolvedValue({ id: 'ceo-target', role: 'CEO' })
    mocks.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    const res = await PUT(makePut('ceo-target', { overrides: [{ path: '/executive', direction: 'RESTRICT' }] }), params('ceo-target'))

    expect(res.status).toBe(200)
    expect(mocks.upsert).toHaveBeenCalledTimes(1)
  })

  it('SUPER_ADMIN can GRANT /executive — SUPER_ADMIN itself has EXEC_ONLY by default', async () => {
    vi.mocked(requireRoles).mockResolvedValue(superAdminSession as any)
    mocks.findUnique.mockResolvedValue({ id: 'u1', role: 'EMPLOYEE' })
    mocks.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    const res = await PUT(makePut('u1', { overrides: [{ path: '/executive', direction: 'GRANT' }] }), params('u1'))

    expect(res.status).toBe(200)
  })

  it('RESTRICT is never subject to the "actor lacks default access" check — only GRANT is', async () => {
    // MANAGER_HR lacks /executive by default (not EXEC_ONLY), but RESTRICT
    // on a path the actor doesn't have is still logically safe (it only
    // narrows someone else's access, granting nothing) — the check
    // explicitly filters on direction === 'GRANT'. Target role EMPLOYEE
    // keeps the separate rank check out of the way, isolating just this one
    // check: if RESTRICT were wrongly subject to it too, this would 403
    // instead of succeeding.
    vi.mocked(requireRoles).mockResolvedValue(hrManagerSession as any)
    mocks.findUnique.mockResolvedValue({ id: 'u1', role: 'EMPLOYEE' })
    mocks.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    const res = await PUT(
      makePut('u1', { overrides: [{ path: '/executive', direction: 'RESTRICT' }] }),
      params('u1'),
    )

    expect(res.status).toBe(200)
    expect(mocks.upsert).toHaveBeenCalledTimes(1)
  })
})
