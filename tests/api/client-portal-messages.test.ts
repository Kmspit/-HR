import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/notifications', () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }))

const requireActivePortalSession = vi.fn()
vi.mock('@/lib/portal-session-guard', () => ({
  requireActivePortalSession: (...a: unknown[]) => requireActivePortalSession(...a),
}))

const resolveClientUserIdForPortal = vi.fn()
vi.mock('@/lib/client-message-access', () => ({
  isStaffMessageRole: vi.fn().mockReturnValue(false),
  resolveClientUserIdForPortal: (...a: unknown[]) => resolveClientUserIdForPortal(...a),
  staffCanAccessClientMessages: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clientMessage: { create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    taskAssignment: { findUnique: vi.fn() },
  },
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'
import { POST } from '@/app/api/client-portal/messages/route'

function makeReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/client-portal/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const portalSession = {
  ok: true,
  session: { portalUserId: 'pu-1', clientCompanyId: 'company-A', email: 'client@a.com', fullName: 'Client A' },
}

describe('POST /api/client-portal/messages — taskId ownership is verified before the message row is created', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireActivePortalSession.mockResolvedValue(portalSession)
    resolveClientUserIdForPortal.mockResolvedValue('legacy-client-1')
    vi.mocked(prisma.clientMessage.create).mockResolvedValue({ id: 'msg-1' } as never)
  })

  it('rejects with 403 and never creates the row when taskId belongs to a different client', async () => {
    vi.mocked(prisma.taskAssignment.findUnique).mockResolvedValue({
      assigneeId: 'staff-1', assignedById: 'staff-2', title: 'Other case', clientId: 'someone-elses-client',
    } as never)

    const res = await POST(makeReq({ content: 'hello', taskId: 'foreign-task' }))

    expect(res.status).toBe(403)
    expect(prisma.clientMessage.create).not.toHaveBeenCalled()
    expect(createNotification).not.toHaveBeenCalled()
  })

  it('rejects with 403 when taskId does not exist at all', async () => {
    vi.mocked(prisma.taskAssignment.findUnique).mockResolvedValue(null as never)

    const res = await POST(makeReq({ content: 'hello', taskId: 'nonexistent-task' }))

    expect(res.status).toBe(403)
    expect(prisma.clientMessage.create).not.toHaveBeenCalled()
  })

  it('creates the message and notifies staff when taskId legitimately belongs to this client', async () => {
    vi.mocked(prisma.taskAssignment.findUnique).mockResolvedValue({
      assigneeId: 'staff-1', assignedById: 'staff-2', title: 'My case', clientId: 'legacy-client-1',
    } as never)

    const res = await POST(makeReq({ content: 'hello', taskId: 'my-task' }))

    expect(res.status).toBe(201)
    expect(prisma.clientMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ taskId: 'my-task', clientId: 'legacy-client-1' }) }),
    )
    expect(createNotification).toHaveBeenCalledTimes(2)
  })

  it('creates the message with no task check at all when no taskId is given', async () => {
    const res = await POST(makeReq({ content: 'hello' }))

    expect(res.status).toBe(201)
    expect(prisma.taskAssignment.findUnique).not.toHaveBeenCalled()
    expect(prisma.clientMessage.create).toHaveBeenCalled()
  })
})
