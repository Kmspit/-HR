import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    warning: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    warningRule: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

vi.mock('@/lib/api-guard', () => ({
  requireAuth: vi.fn(),
  isGuardResponse: (v: unknown) => v instanceof Response,
}))

vi.mock('@/lib/warning-auto', () => ({
  archiveExpiredWarnings: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/warningEngine', () => ({
  runWarningCheck: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/branch-scope', () => ({
  buildBranchScope: vi.fn().mockReturnValue({ role: 'HR', userBranchId: null }),
  branchUserWhere: vi.fn((_scope, extra) => extra ?? {}),
  parseBranchQueryParam: vi.fn().mockReturnValue(undefined),
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-guard'
import { runWarningCheck } from '@/lib/warningEngine'
import { GET as warningsGet } from '@/app/api/warnings/route'
import { GET as employeesGet } from '@/app/api/warnings/employees/route'
import { POST as runCheckPost } from '@/app/api/warnings/run-check/route'

const mgrSession = { user: { id: 'mgr-1', role: 'MANAGER', branchId: 'b1', name: 'Mgr' } }
const hrSession = { user: { id: 'hr-1', role: 'HR', branchId: 'b1', name: 'HR' } }

describe('GET /api/warnings org-scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.warning.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'rep-1' }] as never)
  })

  it('scopes MANAGER list to direct reports', async () => {
    vi.mocked(auth).mockResolvedValue(mgrSession as never)

    const res = await warningsGet(new NextRequest('http://localhost/api/warnings'))
    expect(res.status).toBe(200)

    expect(prisma.warning.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: { in: ['mgr-1', 'rep-1'] },
        }),
      }),
    )
  })

  it('does not org-scope HR list', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)

    const res = await warningsGet(new NextRequest('http://localhost/api/warnings'))
    expect(res.status).toBe(200)

    expect(prisma.warning.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
      }),
    )
  })
})

describe('GET /api/warnings/employees org-scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as never)
  })

  it('returns 403 for employee without warning permissions', async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: 'emp-1', role: 'EMPLOYEE', branchId: 'b1' },
    } as never)

    const res = await employeesGet(new Request('http://localhost/api/warnings/employees'))
    expect(res.status).toBe(403)
  })

  it('scopes MANAGER employee list to direct reports', async () => {
    vi.mocked(requireAuth).mockResolvedValue(mgrSession as never)
    vi.mocked(prisma.user.findMany)
      .mockResolvedValueOnce([{ id: 'rep-1' }] as never)
      .mockResolvedValueOnce([] as never)

    const res = await employeesGet(new Request('http://localhost/api/warnings/employees'))
    expect(res.status).toBe(200)

    const teamQuery = vi.mocked(prisma.user.findMany).mock.calls.at(-1)?.[0]
    expect(teamQuery?.where).toEqual(
      expect.objectContaining({
        id: { in: ['mgr-1', 'rep-1'] },
      }),
    )
  })
})

describe('POST /api/warnings/run-check org-scope', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passes scoped userIds for MANAGER', async () => {
    vi.mocked(auth).mockResolvedValue(mgrSession as never)
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'rep-1' }] as never)

    const req = new NextRequest('http://localhost/api/warnings/run-check', { method: 'POST' })
    const res = await runCheckPost(req)
    expect(res.status).toBe(200)

    expect(runWarningCheck).toHaveBeenCalledWith({ userIds: ['rep-1'] })
  })

  it('runs company-wide for HR', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)

    const req = new NextRequest('http://localhost/api/warnings/run-check', { method: 'POST' })
    const res = await runCheckPost(req)
    expect(res.status).toBe(200)

    expect(runWarningCheck).toHaveBeenCalledWith()
  })
})
