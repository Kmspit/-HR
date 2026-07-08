import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

const apiSignRequest = vi.fn().mockReturnValue('fake-signature')
vi.mock('cloudinary', () => ({
  v2: {
    config: vi.fn(),
    utils: { api_sign_request: (...a: unknown[]) => apiSignRequest(...a) },
  },
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { GET } from '@/app/api/upload/sign/route'

const mockSession = { user: { id: 'user-1' } }

function makeReq(context?: string) {
  const url = context
    ? `http://localhost/api/upload/sign?context=${context}`
    : 'http://localhost/api/upload/sign'
  return new NextRequest(url)
}

describe('GET /api/upload/sign — restricts type/size before issuing the Cloudinary signature', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(mockSession as never)
    process.env.CLOUDINARY_CLOUD_NAME = 'demo-cloud'
    process.env.CLOUDINARY_API_KEY = 'key-123'
    process.env.CLOUDINARY_API_SECRET = 'secret-456'
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const res = await GET(makeReq('documents'))
    expect(res.status).toBe(401)
  })

  it('signs the request with an allowed_formats whitelist and a max_file_size cap', async () => {
    const res = await GET(makeReq('documents'))
    expect(res.status).toBe(200)

    expect(apiSignRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        allowed_formats: expect.stringContaining('pdf'),
        max_file_size: expect.any(Number),
      }),
      'secret-456',
    )
    const [signedParams] = apiSignRequest.mock.calls[0] as [Record<string, unknown>]
    expect(signedParams.max_file_size).toBeGreaterThan(0)
    expect(String(signedParams.allowed_formats).split(',')).toEqual(
      expect.arrayContaining(['pdf', 'jpg', 'png', 'docx', 'xlsx', 'zip']),
    )
  })

  it('returns allowedFormats and maxFileSize to the client so it can be re-submitted to Cloudinary unmodified', async () => {
    const res = await GET(makeReq('documents'))
    const data = await res.json()
    expect(data.allowedFormats).toContain('pdf')
    expect(data.maxFileSize).toBeGreaterThan(0)
    expect(data.signature).toBe('fake-signature')
  })
})
