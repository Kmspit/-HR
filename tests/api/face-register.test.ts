import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/biometric-consent', () => ({
  getLatestConsentAction: vi.fn(),
}))

vi.mock('@/lib/face-attendance', () => ({
  parseSamplesFromBody: vi.fn(),
  registerFaceProfile: vi.fn(),
}))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

import { auth } from '@/lib/auth'
import { getLatestConsentAction } from '@/lib/biometric-consent'
import { parseSamplesFromBody, registerFaceProfile } from '@/lib/face-attendance'
import { POST } from '@/app/api/face/register/route'

function makeReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/face/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

describe('POST /api/face/register — hard-blocked without explicit GRANTED consent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
  })

  it('rejects with 403 CONSENT_REQUIRED when there is no consent record at all', async () => {
    vi.mocked(getLatestConsentAction).mockResolvedValue(null)

    const res = await POST(makeReq({ samples: [[1, 2, 3]] }))

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.code).toBe('CONSENT_REQUIRED')
    expect(registerFaceProfile).not.toHaveBeenCalled()
  })

  it('rejects with 403 CONSENT_REQUIRED when consent was REVOKED', async () => {
    vi.mocked(getLatestConsentAction).mockResolvedValue('REVOKED')

    const res = await POST(makeReq({ samples: [[1, 2, 3]] }))

    expect(res.status).toBe(403)
    expect(registerFaceProfile).not.toHaveBeenCalled()
  })

  it('proceeds to registration once consent is GRANTED', async () => {
    vi.mocked(getLatestConsentAction).mockResolvedValue('GRANTED')
    vi.mocked(parseSamplesFromBody).mockReturnValue([[1, 2, 3], [1, 2, 3], [1, 2, 3]])
    vi.mocked(registerFaceProfile).mockResolvedValue({
      registeredAt: new Date('2026-09-09'),
      sampleCount: 3,
    } as never)

    const res = await POST(makeReq({ samples: [[1, 2, 3], [1, 2, 3], [1, 2, 3]] }))

    expect(res.status).toBe(200)
    expect(registerFaceProfile).toHaveBeenCalledWith('u1', expect.any(Array), 1, null)
  })
})
