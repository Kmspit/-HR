import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    case: {
      findUnique: vi.fn(),
      update:     vi.fn(),
    },
    caseCourt: {
      findUnique: vi.fn(),
      update:     vi.fn(),
      delete:     vi.fn(),
    },
    caseTimeline: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}))

vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  sendLineMessage:    vi.fn().mockResolvedValue(undefined),
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PATCH } from '@/app/api/cases/[id]/route'
import { PATCH as courtPatch, DELETE as courtDelete } from '@/app/api/cases/[id]/court/[courtId]/route'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePatch(body: Record<string, unknown>) {
  return new Request('http://localhost/api/cases/case-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const params = Promise.resolve({ id: 'case-1' })
const courtParams = Promise.resolve({ id: 'case-1', courtId: 'court-1' })

const caseRow = {
  createdById: 'creator-1', assignedEmployeeId: 'assignee-1', department: 'แผนกกฎหมาย',
  status: 'NEW', caseNumber: 'CS-2026-001', caseTitle: 'คดีทดสอบ',
}

describe('PATCH /api/cases/[id] — assignee can edit their own case', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.case.findUnique).mockResolvedValue(caseRow as never)
    vi.mocked(prisma.case.update).mockResolvedValue({ id: 'case-1', ...caseRow } as never)
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const res = await PATCH(makePatch({ caseTitle: 'ใหม่' }), { params })
    expect(res.status).toBe(401)
  })

  it('allows the assigned employee to edit their own case', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'assignee-1', role: 'LAWYER', name: 'Assignee', department: null },
    } as never)

    const res = await PATCH(makePatch({ caseTitle: 'ชื่อคดีใหม่' }), { params })
    expect(res.status).toBe(200)
    expect(prisma.case.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'case-1' },
        data: expect.objectContaining({ caseTitle: 'ชื่อคดีใหม่' }),
      }),
    )
  })

  it('still forbids a user who is neither creator, assignee, exec, nor same-department manager', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'other-1', role: 'LAWYER', name: 'Other', department: null },
    } as never)

    const res = await PATCH(makePatch({ caseTitle: 'ชื่อคดีใหม่' }), { params })
    expect(res.status).toBe(403)
    expect(prisma.case.update).not.toHaveBeenCalled()
  })

  it('still allows the creator to edit (unchanged behaviour)', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'creator-1', role: 'LAWYER', name: 'Creator', department: null },
    } as never)

    const res = await PATCH(makePatch({ caseTitle: 'ชื่อคดีใหม่' }), { params })
    expect(res.status).toBe(200)
  })

  it('still allows EXEC roles regardless of assignment (unchanged behaviour)', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'hr-1', role: 'HR', name: 'HR', department: null },
    } as never)

    const res = await PATCH(makePatch({ caseTitle: 'ชื่อคดีใหม่' }), { params })
    expect(res.status).toBe(200)
  })
})

describe('DELETE /api/cases/[id]/court/[courtId] — assignee can delete a court event on their case', () => {
  const courtRow = {
    id: 'court-1', caseId: 'case-1', createdById: 'creator-1', courtName: 'ศาลแพ่ง',
    case: { createdById: 'creator-1', assignedEmployeeId: 'assignee-1' },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.caseCourt.findUnique).mockResolvedValue(courtRow as never)
    vi.mocked(prisma.caseCourt.delete).mockResolvedValue({} as never)
  })

  it('allows the case assignee to delete a court event even if they did not create it', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'assignee-1', role: 'LAWYER', name: 'Assignee' },
    } as never)

    const res = await courtDelete(new Request('http://localhost', { method: 'DELETE' }), { params: courtParams })
    expect(res.status).toBe(200)
    expect(prisma.caseCourt.delete).toHaveBeenCalledWith({ where: { id: 'court-1' } })
  })

  it('still forbids an unrelated user from deleting the court event', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'other-1', role: 'LAWYER', name: 'Other' },
    } as never)

    const res = await courtDelete(new Request('http://localhost', { method: 'DELETE' }), { params: courtParams })
    expect(res.status).toBe(403)
    expect(prisma.caseCourt.delete).not.toHaveBeenCalled()
  })

  it('allows the assignee to edit a court event (pre-existing behaviour, still works)', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'assignee-1', role: 'LAWYER', name: 'Assignee' },
    } as never)
    vi.mocked(prisma.caseCourt.update).mockResolvedValue({ id: 'court-1' } as never)

    const res = await courtPatch(
      new Request('http://localhost', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: 'เลื่อนนัด' }),
      }),
      { params: courtParams },
    )
    expect(res.status).toBe(200)
  })
})
