import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    courtEvent:   { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    case:         { findUnique: vi.fn() },
    caseTimeline: { create: vi.fn().mockResolvedValue({}) },
  },
}))

vi.mock('@/lib/automation-engine', () => ({
  triggerAutomation: vi.fn().mockReturnValue({ catch: () => undefined }),
}))

vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  notifyRole:         vi.fn().mockResolvedValue(undefined),
  sendLineMessage:    vi.fn().mockResolvedValue(undefined),
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GET, PATCH, DELETE } from '@/app/api/court-events/[id]/route'

const params = Promise.resolve({ id: 'event-1' })

const caseRow = { createdById: 'case-creator', assignedEmployeeId: 'case-assignee', department: 'แผนกกฎหมาย' }

const eventRow = {
  id: 'event-1', caseId: 'case-1', createdById: 'other-creator', assignedLawyerId: null,
  status: 'SCHEDULED', case: { caseNumber: 'CS-1', caseTitle: 'คดีทดสอบ' },
}

function makeReq(method: string, body?: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/court-events/event-1', {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })
}

describe('court-events/[id] — canEdit now matches the case-level UI gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.courtEvent.findUnique).mockResolvedValue(eventRow as never)
    vi.mocked(prisma.case.findUnique).mockResolvedValue(caseRow as never)
    vi.mocked(prisma.courtEvent.update).mockResolvedValue({ ...eventRow, status: 'SCHEDULED' } as never)
    vi.mocked(prisma.courtEvent.delete).mockResolvedValue({} as never)
  })

  it('GET forbids a user unrelated to the event or its case', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'stranger-1', role: 'LAWYER', department: null } } as never)
    const res = await GET(makeReq('GET'), { params })
    expect(res.status).toBe(403)
  })

  it('GET allows the case assignee even though they are not the event creator/lawyer (previously 403)', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'case-assignee', role: 'LAWYER', department: null } } as never)
    const res = await GET(makeReq('GET'), { params })
    expect(res.status).toBe(200)
  })

  it('PATCH allows a MANAGER in the case\'s own department (previously 403)', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'mgr-1', role: 'MANAGER', department: 'แผนกกฎหมาย' },
    } as never)
    const res = await PATCH(makeReq('PATCH', { note: 'เลื่อนนัด' }), { params })
    expect(res.status).toBe(200)
  })

  it('PATCH forbids a MANAGER from a different department', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'mgr-2', role: 'MANAGER', department: 'แผนกอื่น' },
    } as never)
    const res = await PATCH(makeReq('PATCH', { note: 'เลื่อนนัด' }), { params })
    expect(res.status).toBe(403)
    expect(prisma.courtEvent.update).not.toHaveBeenCalled()
  })

  it('DELETE allows the case creator even though they did not create this specific event (previously 403)', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'case-creator', role: 'LAWYER', department: null } } as never)
    const res = await DELETE(makeReq('DELETE'), { params })
    expect(res.status).toBe(200)
    expect(prisma.courtEvent.delete).toHaveBeenCalledWith({ where: { id: 'event-1' } })
  })

  it('DELETE still forbids a user with no relation to the event or case', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'stranger-2', role: 'LAWYER', department: null } } as never)
    const res = await DELETE(makeReq('DELETE'), { params })
    expect(res.status).toBe(403)
    expect(prisma.courtEvent.delete).not.toHaveBeenCalled()
  })

  it('still allows the event\'s own creator (unchanged behaviour)', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'other-creator', role: 'LAWYER', department: null } } as never)
    const res = await PATCH(makeReq('PATCH', { note: 'x' }), { params })
    expect(res.status).toBe(200)
  })
})
