import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/announcement-events', () => ({
  announcementEmitter: { on: vi.fn(), off: vi.fn() },
}))

import { auth } from '@/lib/auth'
import { GET } from '@/app/api/announcements/sse/route'

describe('GET /api/announcements/sse', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 without session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const res = await GET(new Request('http://localhost/api/announcements/sse'))
    expect(res.status).toBe(401)
  })

  it('returns 200 stream with session', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'u1', role: 'EMPLOYEE' },
    } as never)
    const res = await GET(new Request('http://localhost/api/announcements/sse'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
  })
})
