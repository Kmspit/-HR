import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/face-attendance', () => ({
  userHasFaceProfile: vi.fn(),
  shouldRequireFaceVerification: vi.fn(),
}))

vi.mock('@/lib/biometric-consent', () => ({
  CONSENT_VERSION: '1.0',
  getLatestConsentAction: vi.fn(),
  gracePeriodEndsAt: () => new Date('2026-09-16T00:00:00+07:00'),
  isPastGracePeriod: vi.fn().mockReturnValue(false),
  daysRemainingInGracePeriod: vi.fn().mockReturnValue(5),
  recordConsentAction: vi.fn(),
}))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

import { auth } from '@/lib/auth'
import { userHasFaceProfile, shouldRequireFaceVerification } from '@/lib/face-attendance'
import { getLatestConsentAction, isPastGracePeriod, recordConsentAction } from '@/lib/biometric-consent'
import { GET, POST } from '@/app/api/biometric-consent/route'

function makePost(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/biometric-consent', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

describe('GET /api/biometric-consent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
  })

  it('401s when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('reports hasProfile/latestAction/faceRequired and grace-period info', async () => {
    vi.mocked(userHasFaceProfile).mockResolvedValue(true)
    vi.mocked(getLatestConsentAction).mockResolvedValue(null)
    vi.mocked(shouldRequireFaceVerification).mockResolvedValue(true)
    vi.mocked(isPastGracePeriod).mockReturnValue(false)

    const res = await GET()
    const body = await res.json()

    expect(body.hasProfile).toBe(true)
    expect(body.latestAction).toBeNull()
    expect(body.faceRequired).toBe(true)
    expect(body.gracePeriod.active).toBe(true)
    expect(body.gracePeriod.daysRemaining).toBe(5)
  })

  it('gracePeriod.active is false once a consent decision has been recorded', async () => {
    vi.mocked(userHasFaceProfile).mockResolvedValue(true)
    vi.mocked(getLatestConsentAction).mockResolvedValue('GRANTED')
    vi.mocked(shouldRequireFaceVerification).mockResolvedValue(true)

    const res = await GET()
    const body = await res.json()
    expect(body.gracePeriod.active).toBe(false)
  })
})

describe('POST /api/biometric-consent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
    vi.mocked(recordConsentAction).mockResolvedValue({ id: 'c1', action: 'GRANTED' } as never)
  })

  it('rejects an invalid action', async () => {
    const res = await POST(makePost({ action: 'MAYBE', method: 'CHECKBOX', consentText: 'x', scrolledToEnd: true }))
    expect(res.status).toBe(400)
    expect(recordConsentAction).not.toHaveBeenCalled()
  })

  it('rejects GRANTED when scrolledToEnd is not true', async () => {
    const res = await POST(makePost({ action: 'GRANTED', method: 'CHECKBOX', consentText: 'x', scrolledToEnd: false }))
    expect(res.status).toBe(400)
    expect(recordConsentAction).not.toHaveBeenCalled()
  })

  it('rejects an empty consentText', async () => {
    const res = await POST(makePost({ action: 'GRANTED', method: 'CHECKBOX', consentText: '  ', scrolledToEnd: true }))
    expect(res.status).toBe(400)
  })

  it('accepts REVOKED even when scrolledToEnd is false', async () => {
    const res = await POST(makePost({ action: 'REVOKED', method: 'CHECKBOX', consentText: 'x', scrolledToEnd: false }))
    expect(res.status).toBe(200)
    expect(recordConsentAction).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', action: 'REVOKED' }))
  })

  it('accepts a valid GRANTED submission and records ip/userAgent from headers', async () => {
    const req = new NextRequest('http://localhost/api/biometric-consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '1.2.3.4', 'user-agent': 'test-ua' },
      body: JSON.stringify({ action: 'GRANTED', method: 'CHECKBOX', consentText: 'full text', scrolledToEnd: true }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(recordConsentAction).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', action: 'GRANTED', ipAddress: '1.2.3.4', userAgent: 'test-ua' }),
    )
  })
})
