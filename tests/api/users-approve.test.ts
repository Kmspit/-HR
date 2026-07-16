import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  },
}))

const createNotification = vi.fn().mockResolvedValue(undefined)
const sendLineNotify = vi.fn().mockResolvedValue(true)
const createAuditLog = vi.fn().mockResolvedValue({ id: 'audit-1' })
vi.mock('@/lib/notifications', () => ({
  createNotification: (...a: unknown[]) => createNotification(...a),
  sendLineNotify: (...a: unknown[]) => sendLineNotify(...a),
  createAuditLog: (...a: unknown[]) => createAuditLog(...a),
}))

vi.mock('@/lib/access-control', () => ({ canApproveAccounts: vi.fn().mockReturnValue(true) }))

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Map([['x-forwarded-for', '1.2.3.4']])),
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canApproveAccounts } from '@/lib/access-control'
import { POST } from '@/app/api/users/[id]/approve/route'

const hrSession = { user: { id: 'hr-1', name: 'HR Officer', role: 'HR', branchId: 'branch-1' } }
const params = Promise.resolve({ id: 'pending-1' })

function makeReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/users/pending-1/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const pendingUser = {
  id: 'pending-1', name: 'New Hire', email: 'newhire@x.com', status: 'PENDING', branchId: 'branch-1',
}

describe('POST /api/users/[id]/approve — audit log is awaited, notification/LINE are fire-and-forget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(canApproveAccounts).mockReturnValue(true)
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.user.findUnique).mockResolvedValue(pendingUser as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'pending-1' } as never)
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 } as never)
  })

  it('approves the account and returns success', async () => {
    const res = await POST(makeReq({ action: 'APPROVE' }), { params })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data).toEqual({ success: true, status: 'ACTIVE' })
  })

  it('always awaits createAuditLog before responding — the audit write has genuinely completed by response time', async () => {
    let auditResolved = false
    createAuditLog.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      auditResolved = true
      return { id: 'audit-1' }
    })

    await POST(makeReq({ action: 'APPROVE' }), { params })

    // If the route were still awaiting this, by the time POST() resolves the
    // audit write must have finished — proving it's not fire-and-forget.
    expect(auditResolved).toBe(true)
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'hr-1', targetId: 'pending-1', action: 'APPROVE' }),
    )
  })

  it('does not block the response on createNotification/sendLineNotify resolving (fire-and-forget)', async () => {
    // Never-resolving — if the route still awaited these, this would hang/time out.
    createNotification.mockReturnValue(new Promise(() => {}))
    sendLineNotify.mockReturnValue(new Promise(() => {}))

    const res = await POST(makeReq({ action: 'APPROVE' }), { params })

    expect(res.status).toBe(200)
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'pending-1', type: 'ACCOUNT_APPROVED' }),
    )
    expect(sendLineNotify).toHaveBeenCalledWith(expect.stringContaining('อนุมัติแล้ว'))
  })

  it('rejects the account with REJECTED status and a rejection notification', async () => {
    const res = await POST(makeReq({ action: 'REJECT', reason: 'เอกสารไม่ครบ' }), { params })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.status).toBe('REJECTED')
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'REJECT' }))
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ACCOUNT_REJECTED', message: expect.stringContaining('เอกสารไม่ครบ') }),
    )
  })

  it('forbids a role without account-approval permission', async () => {
    vi.mocked(canApproveAccounts).mockReturnValue(false)
    const res = await POST(makeReq({ action: 'APPROVE' }), { params })
    expect(res.status).toBe(403)
    expect(prisma.user.updateMany).not.toHaveBeenCalled()
  })

  it('returns 400 when the target user is not PENDING', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...pendingUser, status: 'ACTIVE' } as never)
    const res = await POST(makeReq({ action: 'APPROVE' }), { params })
    expect(res.status).toBe(400)
  })

  it('returns 403 when the target user is outside the approver\'s branch scope', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null as never)
    const res = await POST(makeReq({ action: 'APPROVE' }), { params })
    expect(res.status).toBe(403)
    expect(prisma.user.updateMany).not.toHaveBeenCalled()
  })
})

describe('POST /api/users/[id]/approve — atomic race guard (Phase B)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(canApproveAccounts).mockReturnValue(true)
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.user.findUnique).mockResolvedValue(pendingUser as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'pending-1' } as never)
  })

  it('writes via updateMany with a where-guard on status: PENDING', async () => {
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 } as never)
    await POST(makeReq({ action: 'APPROVE' }), { params })
    expect(prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'pending-1', status: 'PENDING' }) }),
    )
  })

  it('rejects the loser of a concurrent approve/reject race with 409, and skips audit log + notifications', async () => {
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 0 } as never)
    const res = await POST(makeReq({ action: 'APPROVE' }), { params })
    expect(res.status).toBe(409)
    expect(createAuditLog).not.toHaveBeenCalled()
    expect(createNotification).not.toHaveBeenCalled()
    expect(sendLineNotify).not.toHaveBeenCalled()
  })
})
