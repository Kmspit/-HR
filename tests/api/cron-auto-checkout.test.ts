import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/cron-secret', () => ({ rejectUnauthorizedCron: vi.fn().mockReturnValue(null) }))

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { attendance: { findMany: mocks.findMany, update: mocks.update } },
}))

vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}))

import { createAuditLog } from '@/lib/notifications'
import { GET } from '@/app/api/cron/auto-checkout/route'

function makeReq() {
  return new NextRequest('http://localhost/api/cron/auto-checkout', {
    headers: { 'x-cron-secret': 'test' },
  })
}

const openSession = {
  id: 'att-1',
  checkIn: new Date('2026-09-07T02:00:00.000Z'),
  checkOut: null,
  lunchOut: null,
  lunchIn: null,
  user: { id: 'emp-1', name: 'พนักงาน หนึ่ง' },
}

describe('GET /api/cron/auto-checkout — actorId FK fix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.update.mockResolvedValue({})
  })

  it('does nothing when there are no open sessions', async () => {
    mocks.findMany.mockResolvedValue([])
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    expect(createAuditLog).not.toHaveBeenCalled()
  })

  it('writes the audit log with actorId null and an actorLabel identifying the cron, never the old sentinel string', async () => {
    mocks.findMany.mockResolvedValue([openSession])
    const res = await GET(makeReq())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.applied).toBe(1)
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: null,
        actorLabel: 'cron:auto-checkout',
        targetId: 'att-1',
        targetType: 'Attendance',
        action: 'UPDATE',
      }),
    )
    const call = vi.mocked(createAuditLog).mock.calls[0][0]
    expect(call.actorId).not.toBe('system')
  })
})
