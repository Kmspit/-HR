import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn() } },
}))

const createOtp = vi.fn()
vi.mock('@/lib/otp', () => ({ createOtp: (...a: unknown[]) => createOtp(...a) }))

const pushLineMessages = vi.fn()
vi.mock('@/lib/line-api', () => ({ pushLineMessages: (...a: unknown[]) => pushLineMessages(...a) }))

const rateLimit = vi.fn().mockReturnValue({ allowed: true, remaining: 4, resetAt: Date.now() })
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: (...a: unknown[]) => rateLimit(...a),
}))

const padToMinDuration = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/timing-safety', () => ({
  padToMinDuration: (...a: unknown[]) => padToMinDuration(...a),
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma'
import { POST } from '@/app/api/auth/forgot-password/request/route'

function makeReq(email: string) {
  return new NextRequest('http://localhost/api/auth/forgot-password/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
}

describe('POST /api/auth/forgot-password/request — no timing side-channel between existing/non-existing accounts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rateLimit.mockReturnValue({ allowed: true, remaining: 4, resetAt: Date.now() })
  })

  it('non-existent account: same uniform message, and the response is padded to the same floor as a real account', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never)
    const res = await POST(makeReq('nobody@x.com'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(createOtp).not.toHaveBeenCalled()
    expect(pushLineMessages).not.toHaveBeenCalled()
    expect(padToMinDuration).toHaveBeenCalledWith(expect.any(Number), 400)
  })

  it('non-ACTIVE account (e.g. PENDING/DISABLED): same uniform response, same padding — does not leak account status', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1', lineUserId: 'line-1', status: 'PENDING' } as never)
    const res = await POST(makeReq('pending@x.com'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(createOtp).not.toHaveBeenCalled()
    expect(padToMinDuration).toHaveBeenCalledWith(expect.any(Number), 400)
  })

  it('existing ACTIVE account: creates the OTP, sets the challenge cookie, and is padded to the same floor', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1', lineUserId: 'line-1', status: 'ACTIVE' } as never)
    createOtp.mockResolvedValue({ challenge: 'chal-1', code: '123456' })
    // Never resolves within the test — proves the response doesn't wait for it.
    pushLineMessages.mockReturnValue(new Promise(() => {}))

    const res = await POST(makeReq('user@x.com'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(createOtp).toHaveBeenCalledWith('u1', 'FORGOT_PASSWORD', 'LINE')
    expect(pushLineMessages).toHaveBeenCalled()
    expect(res.cookies.get('hrflow_fp_challenge')?.value).toBe('chal-1')
    expect(padToMinDuration).toHaveBeenCalledWith(expect.any(Number), 400)
  })

  it('per-account throttle: once this account has had too many OTP requests (even from different IPs), no new OTP/LINE push is sent — but the response still looks identical to a normal success', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1', lineUserId: 'line-1', status: 'ACTIVE' } as never)
    // Per-IP check passes; per-account check (2nd rateLimit call) is the one that trips.
    rateLimit
      .mockReturnValueOnce({ allowed: true, remaining: 4, resetAt: Date.now() })
      .mockReturnValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() })

    const res = await POST(makeReq('user@x.com'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(createOtp).not.toHaveBeenCalled()
    expect(pushLineMessages).not.toHaveBeenCalled()
    expect(res.cookies.get('hrflow_fp_challenge')).toBeUndefined()
    expect(padToMinDuration).toHaveBeenCalledWith(expect.any(Number), 400)
  })

  it('per-account throttle key is scoped to the account, independent of the requesting IP', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1', lineUserId: 'line-1', status: 'ACTIVE' } as never)
    createOtp.mockResolvedValue({ challenge: 'chal-1', code: '123456' })
    pushLineMessages.mockResolvedValue(true)

    await POST(makeReq('user@x.com'))

    expect(rateLimit).toHaveBeenCalledWith(expect.stringContaining('forgot-pw:acct:u1'), 5, 60 * 60 * 1000)
  })

  it('both branches return byte-for-byte the same JSON body', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never)
    const resNoAccount = await POST(makeReq('nobody@x.com'))
    const noAccountBody = await resNoAccount.json()

    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1', lineUserId: null, status: 'ACTIVE' } as never)
    createOtp.mockResolvedValue({ challenge: 'chal-2', code: '654321' })
    const resAccount = await POST(makeReq('user@x.com'))
    const accountBody = await resAccount.json()

    expect(noAccountBody).toEqual(accountBody)
  })
})
