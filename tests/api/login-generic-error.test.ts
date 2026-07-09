import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn() }, twoFactorSetup: { findUnique: vi.fn().mockResolvedValue(null) } },
}))

const verifyLoginCredentials = vi.fn()
vi.mock('@/lib/login-credentials', () => ({
  verifyLoginCredentials: (...a: unknown[]) => verifyLoginCredentials(...a),
}))

const checkLoginAllowedForIdentifier = vi.fn().mockResolvedValue({ allowed: true })
const recordLoginAttempt = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/login-protection', () => ({
  checkLoginAllowedForIdentifier: (...a: unknown[]) => checkLoginAllowedForIdentifier(...a),
  recordLoginAttempt: (...a: unknown[]) => recordLoginAttempt(...a),
}))

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 29, resetAt: Date.now() }),
}))
vi.mock('@/lib/security-events', () => ({ logSecurityEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/session-token', () => ({ attachSessionCookie: vi.fn(async (res) => res) }))
vi.mock('@/lib/session-epoch', () => ({ getSessionEpoch: vi.fn().mockResolvedValue(1) }))
vi.mock('@/lib/post-login-path', () => ({
  resolvePostLoginPath: vi.fn().mockReturnValue({ path: '/dashboard', message: null }),
}))
vi.mock('@/lib/two-fa-pending', () => ({ create2FAPendingToken: vi.fn().mockResolvedValue('token') }))

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { POST } from '@/app/api/auth/login/route'

function makeReq(email: string, password = 'Password1') {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
}

describe('POST /api/auth/login — account-status failures are generic (anti-enumeration)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    checkLoginAllowedForIdentifier.mockResolvedValue({ allowed: true })
  })

  it('pre-check lockout: returns the same generic error/401 as a wrong password, not ACCOUNT_LOCKED/429', async () => {
    checkLoginAllowedForIdentifier.mockResolvedValue({ allowed: false, lockedUntil: new Date() })
    const res = await POST(makeReq('locked@x.com'))
    const data = await res.json()
    expect(res.status).toBe(401)
    expect(data.error).toBe('INVALID_CREDENTIALS')
    expect(verifyLoginCredentials).not.toHaveBeenCalled()
  })

  it('verifyLoginCredentials reason=ACCOUNT_LOCKED: client sees generic INVALID_CREDENTIALS/401, but the real reason is still logged', async () => {
    verifyLoginCredentials.mockResolvedValue({ ok: false, error: 'INVALID_CREDENTIALS', reason: 'ACCOUNT_LOCKED' })
    const res = await POST(makeReq('user@x.com'))
    const data = await res.json()
    expect(res.status).toBe(401)
    expect(data.error).toBe('INVALID_CREDENTIALS')
    expect(recordLoginAttempt).toHaveBeenCalledWith(
      'user@x.com', false, expect.objectContaining({ reason: 'ACCOUNT_LOCKED' }),
    )
  })

  it('verifyLoginCredentials reason=PENDING_APPROVAL: generic response, real reason still logged', async () => {
    verifyLoginCredentials.mockResolvedValue({ ok: false, error: 'INVALID_CREDENTIALS', reason: 'PENDING_APPROVAL' })
    const res = await POST(makeReq('user@x.com'))
    const data = await res.json()
    expect(res.status).toBe(401)
    expect(data.error).toBe('INVALID_CREDENTIALS')
    expect(recordLoginAttempt).toHaveBeenCalledWith(
      'user@x.com', false, expect.objectContaining({ reason: 'PENDING_APPROVAL' }),
    )
  })

  it('plain wrong password: same generic response, no special reason', async () => {
    verifyLoginCredentials.mockResolvedValue({ ok: false, error: 'INVALID_CREDENTIALS' })
    const res = await POST(makeReq('user@x.com'))
    const data = await res.json()
    expect(res.status).toBe(401)
    expect(data.error).toBe('INVALID_CREDENTIALS')
    expect(recordLoginAttempt).toHaveBeenCalledWith(
      'user@x.com', false, expect.objectContaining({ reason: 'INVALID_CREDENTIALS' }),
    )
  })
})
