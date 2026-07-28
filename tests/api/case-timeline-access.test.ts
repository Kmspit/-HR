import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    case:          { findUnique: vi.fn() },
    caseTimeline:  { findMany: vi.fn(), create: vi.fn() },
  },
}))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GET as timelineGet } from '@/app/api/cases/[id]/timeline/route'

const params = Promise.resolve({ id: 'case-1' })

const strangerSession = { user: { id: 'stranger-1', role: 'LAWYER' } }
const creatorSession  = { user: { id: 'creator-1', role: 'LAWYER' } }
const assigneeSession = { user: { id: 'assignee-1', role: 'LAWYER' } }
const execSession     = { user: { id: 'exec-1', role: 'MANAGER_HR' } }

function getReq() {
  return new NextRequest('http://localhost/api/cases/case-1/timeline')
}

describe('GET /api/cases/[id]/timeline — access check (previously any authenticated user could read any case timeline)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.case.findUnique).mockResolvedValue({
      createdById: 'creator-1', assignedEmployeeId: 'assignee-1', department: 'legal',
    } as never)
    vi.mocked(prisma.caseTimeline.findMany).mockResolvedValue([])
  })

  it('forbids a stranger not assigned to or the creator of the case', async () => {
    vi.mocked(auth).mockResolvedValue(strangerSession as never)
    const res = await timelineGet(getReq(), { params })
    expect(res.status).toBe(403)
    expect(prisma.caseTimeline.findMany).not.toHaveBeenCalled()
  })

  it('allows the case creator', async () => {
    vi.mocked(auth).mockResolvedValue(creatorSession as never)
    const res = await timelineGet(getReq(), { params })
    expect(res.status).toBe(200)
    expect(prisma.caseTimeline.findMany).toHaveBeenCalled()
  })

  it('allows the assigned employee', async () => {
    vi.mocked(auth).mockResolvedValue(assigneeSession as never)
    const res = await timelineGet(getReq(), { params })
    expect(res.status).toBe(200)
  })

  it('allows an EXEC_ROLES user (e.g. MANAGER_HR) regardless of assignment', async () => {
    vi.mocked(auth).mockResolvedValue(execSession as never)
    const res = await timelineGet(getReq(), { params })
    expect(res.status).toBe(200)
  })

  it('returns 404 for a nonexistent case before checking access', async () => {
    vi.mocked(auth).mockResolvedValue(strangerSession as never)
    vi.mocked(prisma.case.findUnique).mockResolvedValue(null as never)
    const res = await timelineGet(getReq(), { params })
    expect(res.status).toBe(404)
  })
})
