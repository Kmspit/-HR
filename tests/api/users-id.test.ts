import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst:  vi.fn(),
      findMany:   vi.fn(),
      update:     vi.fn(),
    },
  },
}))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

vi.mock('@/lib/session-epoch', () => ({
  bumpSessionEpoch: vi.fn().mockResolvedValue(undefined),
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PATCH } from '@/app/api/users/[id]/route'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePatch(id: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const params = (id: string) => Promise.resolve({ id })

const teamLeaderSession = { user: { id: 'tl-1', role: 'TEAM_LEADER', branchId: 'b1' } }
const managerSession    = { user: { id: 'mgr-1', role: 'MANAGER', branchId: 'b1' } }
const hrSession         = { user: { id: 'hr-1', role: 'HR', branchId: 'b1' } }

describe('PATCH /api/users/[id] — editing another user requires canManageUserProfile, not just view-scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.user.update).mockResolvedValue({ id: 'report-1', baseSalary: 99999 } as never)
  })

  it('forbids TEAM_LEADER from changing a direct report\'s salary via direct API call, even though they can view that report\'s timeline', async () => {
    vi.mocked(auth).mockResolvedValue(teamLeaderSession as never)
    // TEAM_LEADER passes the org-hierarchy check (report-1 is their direct report) —
    // this is what let the bug through before: view-scope alone was treated as edit-scope.
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'report-1' }] as never)

    const res = await PATCH(makePatch('report-1', { baseSalary: 999999 }), { params: params('report-1') })
    expect(res.status).toBe(403)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('still allows MANAGER (who has canManageUserProfile) to edit their direct report', async () => {
    vi.mocked(auth).mockResolvedValue(managerSession as never)
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'report-1' }] as never)

    const res = await PATCH(makePatch('report-1', { position: 'Senior Dev' }), { params: params('report-1') })
    expect(res.status).toBe(200)
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'report-1' }, data: expect.objectContaining({ position: 'Senior Dev' }) }),
    )
  })

  it('forbids TEAM_LEADER from editing someone who is not even their direct report', async () => {
    vi.mocked(auth).mockResolvedValue(teamLeaderSession as never)
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as never) // no direct reports match

    const res = await PATCH(makePatch('someone-else', { position: 'x' }), { params: params('someone-else') })
    expect(res.status).toBe(403)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('still allows HR (company-wide) to edit any employee profile', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ branchId: 'b1', managerId: null, teamLeaderId: null } as never)

    const res = await PATCH(makePatch('emp-9', { position: 'Lead' }), { params: params('emp-9') })
    expect(res.status).toBe(200)
  })

  it('still allows a user to edit their own non-restricted fields', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'self-1', role: 'EMPLOYEE', branchId: 'b1' } } as never)

    const res = await PATCH(makePatch('self-1', { nickname: 'ใหม่' }), { params: params('self-1') })
    expect(res.status).toBe(200)
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'self-1' } }),
    )
  })
})
