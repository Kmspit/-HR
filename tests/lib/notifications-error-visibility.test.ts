import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  createMany: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: mocks.findMany },
    notification: { createMany: mocks.createMany },
  },
}))
vi.mock('@/lib/notification-center/broadcast', () => ({
  broadcastNotificationUpdate: vi.fn(),
  broadcastNotificationUpdates: vi.fn(),
  toNotificationItem: (x: unknown) => x,
}))
vi.mock('@/lib/line-api', () => ({ pushLineMessages: vi.fn(), pushLineText: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException, captureMessage: mocks.captureMessage }))

import { notifyRole, sendLineNotify } from '@/lib/notifications'

describe('notifyRole — reports failures to Sentry', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not throw and reports to Sentry when the DB write fails', async () => {
    mocks.findMany.mockResolvedValue([{ id: 'hr-1' }])
    const dbError = new Error('DB blip')
    mocks.createMany.mockRejectedValue(dbError)

    await expect(notifyRole('MANAGER_HR', 'SYSTEM', 'title', 'message')).resolves.toBeUndefined()
    expect(mocks.captureException).toHaveBeenCalledWith(dbError, expect.objectContaining({ tags: expect.objectContaining({ role: 'MANAGER_HR' }) }))
  })
})

describe('sendLineNotify — used as the hard-escalation channel, now visible on failure', () => {
  const originalFetch = global.fetch
  const originalToken = process.env.LINE_NOTIFY_TOKEN

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.LINE_NOTIFY_TOKEN = 'test-line-notify-token-1234567890'
  })
  afterEach(() => {
    global.fetch = originalFetch
    process.env.LINE_NOTIFY_TOKEN = originalToken
  })

  it('reports to Sentry when the network request throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch
    const ok = await sendLineNotify('escalation message')
    expect(ok).toBe(false)
    expect(mocks.captureException).toHaveBeenCalledWith(expect.any(Error))
  })

  it('reports to Sentry when LINE responds with a non-ok status', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'server error' }) as unknown as typeof fetch
    const ok = await sendLineNotify('escalation message')
    expect(ok).toBe(false)
    expect(mocks.captureMessage).toHaveBeenCalledWith(expect.stringContaining('500'), 'error')
  })

  it('does not call Sentry on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' }) as unknown as typeof fetch
    const ok = await sendLineNotify('escalation message')
    expect(ok).toBe(true)
    expect(mocks.captureException).not.toHaveBeenCalled()
    expect(mocks.captureMessage).not.toHaveBeenCalled()
  })
})
