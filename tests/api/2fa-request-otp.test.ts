import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    twoFactorSetup: { findUnique: vi.fn() },
  },
}))

const createOtp = vi.fn()
vi.mock('@/lib/otp', () => ({ createOtp: (...a: unknown[]) => createOtp(...a) }))

const pushLineMessages = vi.fn().mockResolvedValue(true)
vi.mock('@/lib/line-api', () => ({ pushLineMessages: (...a: unknown[]) => pushLineMessages(...a) }))

const verify2FAPendingToken = vi.fn()
vi.mock('@/lib/two-fa-pending', () => ({
  verify2FAPendingToken: (...a: unknown[]) => verify2FAPendingToken(...a),
}))

const rateLimit = vi.fn().mockReturnValue({ allowed: true, remaining: 9, resetAt: Date.now() })
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: (...a: unknown[]) => rateLimit(...a),
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma'
import { POST } from '@/app/api/security/2fa/request-otp/route'

function makeReq(pendingToken: string) {
  return new NextRequest('http://localhost/api/security/2fa/request-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pendingToken }),
  })
}

describe('POST /api/security/2fa/request-otp — per-account throttle in addition to per-IP', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rateLimit.mockReturnValue({ allowed: true, remaining: 9, resetAt: Date.now() })
    verify2FAPendingToken.mockResolvedValue('u1')
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1', name: 'User', lineUserId: 'line-1', status: 'ACTIVE',
    } as never)
    vi.mocked(prisma.twoFactorSetup.findUnique).mockResolvedValue({ enabled: true, channel: 'LINE' } as never)
    createOtp.mockResolvedValue({ challenge: 'chal-1', code: '123456' })
  })

  it('sends the OTP normally when both the per-IP and per-account limits allow it', async () => {
    const res = await POST(makeReq('token-1'))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.sent).toBe(true)
    expect(createOtp).toHaveBeenCalled()
    expect(pushLineMessages).toHaveBeenCalled()
  })

  it('rejects with 429 when the per-account limit is exceeded, even though the per-IP limit still allows it', async () => {
    // Per-IP check passes; per-account check (2nd rateLimit call) is the one that trips.
    rateLimit
      .mockReturnValueOnce({ allowed: true, remaining: 9, resetAt: Date.now() })
      .mockReturnValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() })

    const res = await POST(makeReq('token-1'))
    expect(res.status).toBe(429)
    expect(createOtp).not.toHaveBeenCalled()
    expect(pushLineMessages).not.toHaveBeenCalled()
  })

  it('per-account throttle key is scoped to the account, independent of the requesting IP', async () => {
    await POST(makeReq('token-1'))
    expect(rateLimit).toHaveBeenCalledWith(expect.stringContaining('2fa-otp:acct:u1'), 10, 15 * 60 * 1000)
  })

  it('rejects with 401 before any rate-limit/OTP logic when the pending token is invalid', async () => {
    verify2FAPendingToken.mockResolvedValue(null)
    const res = await POST(makeReq('bad-token'))
    expect(res.status).toBe(401)
    expect(createOtp).not.toHaveBeenCalled()
  })
})
