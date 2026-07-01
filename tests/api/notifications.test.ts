import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    notification: {
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))
vi.mock('@/lib/notification-center/broadcast', () => ({
  broadcastNotificationUpdate: vi.fn(),
}))
vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/notifications/route'

describe('GET /api/notifications', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 without session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const res = await GET(new NextRequest('http://localhost/api/notifications'))
    expect(res.status).toBe(401)
  })

  it('paginates with cursor and limit', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'u1', role: 'EMPLOYEE' },
    } as never)
    vi.mocked(prisma.notification.findMany)
      .mockResolvedValueOnce([
        { id: 'n2', type: 'SYSTEM', title: 't', message: 'm', link: null, isRead: false, createdAt: new Date(), taskId: null },
        { id: 'n1', type: 'SYSTEM', title: 't', message: 'm', link: null, isRead: true, createdAt: new Date(), taskId: null },
      ] as never)
      .mockResolvedValueOnce([] as never)
    vi.mocked(prisma.notification.count).mockResolvedValue(1)

    const res = await GET(
      new NextRequest('http://localhost/api/notifications?limit=1&cursor=n3'),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.notifications).toHaveLength(1)
    expect(body.nextCursor).toBe('n2')
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 2, cursor: { id: 'n3' }, skip: 1 }),
    )
  })
})
