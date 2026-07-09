import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    case: { findUnique: vi.fn() },
    taskAssignment: { findUnique: vi.fn() },
    caseDocument: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
  },
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/case-documents/route'

function makeReq(qs: string) {
  return new NextRequest(`http://localhost/api/case-documents${qs}`)
}

const caseRow = { createdById: 'creator-1', assignedEmployeeId: 'assignee-1', department: 'แผนกกฎหมาย' }
const taskRow = { assigneeId: 'assignee-1', assignedById: 'assigner-1' }

describe('GET /api/case-documents — caseId/taskId no longer bypass scoping for non-exec/non-manager roles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.caseDocument.findMany).mockResolvedValue([])
    vi.mocked(prisma.caseDocument.count).mockResolvedValue(0)
  })

  it('forbids a stranger from listing documents on a case they have no relationship to', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'stranger-1', role: 'EMPLOYEE' } } as never)
    vi.mocked(prisma.case.findUnique).mockResolvedValue(caseRow as never)
    const res = await GET(makeReq('?caseId=case-1'))
    expect(res.status).toBe(403)
    expect(prisma.caseDocument.findMany).not.toHaveBeenCalled()
  })

  it('allows the case assignee to list documents for their own case', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'assignee-1', role: 'LAWYER' } } as never)
    vi.mocked(prisma.case.findUnique).mockResolvedValue(caseRow as never)
    const res = await GET(makeReq('?caseId=case-1'))
    expect(res.status).toBe(200)
    expect(prisma.caseDocument.findMany).toHaveBeenCalled()
  })

  it('allows an EXEC role (e.g. HR) to list documents for any case without a relationship check', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'hr-1', role: 'HR' } } as never)
    const res = await GET(makeReq('?caseId=case-1'))
    expect(res.status).toBe(200)
    expect(prisma.case.findUnique).not.toHaveBeenCalled()
  })

  it('allows MANAGER to list documents for any case without a relationship check (matches the unscoped general-list behavior)', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'mgr-1', role: 'MANAGER' } } as never)
    const res = await GET(makeReq('?caseId=case-1'))
    expect(res.status).toBe(200)
    expect(prisma.case.findUnique).not.toHaveBeenCalled()
  })

  it('forbids a stranger from listing documents for a task they are neither assignee nor assigner of', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'stranger-1', role: 'EMPLOYEE' } } as never)
    vi.mocked(prisma.taskAssignment.findUnique).mockResolvedValue(taskRow as never)
    const res = await GET(makeReq('?taskId=task-1'))
    expect(res.status).toBe(403)
    expect(prisma.caseDocument.findMany).not.toHaveBeenCalled()
  })

  it('allows the task assignee to list documents for their own task', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'assignee-1', role: 'LAWYER' } } as never)
    vi.mocked(prisma.taskAssignment.findUnique).mockResolvedValue(taskRow as never)
    const res = await GET(makeReq('?taskId=task-1'))
    expect(res.status).toBe(200)
  })

  it('still allows a non-exec role to list without caseId/taskId (own + assigned scoping, unaffected by this fix)', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'emp-1', role: 'EMPLOYEE' } } as never)
    const res = await GET(makeReq(''))
    expect(res.status).toBe(200)
    expect(prisma.case.findUnique).not.toHaveBeenCalled()
    expect(prisma.taskAssignment.findUnique).not.toHaveBeenCalled()
  })
})
