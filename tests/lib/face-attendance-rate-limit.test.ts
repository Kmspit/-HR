import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userFaceProfile: { findUnique: vi.fn() },
    attendanceFaceLog: { create: vi.fn().mockResolvedValue({ id: 'log-1' }) },
  },
}))

vi.mock('@/lib/face-security', () => ({
  countRecentFaceMismatches: vi.fn(),
  notifyFaceSecurityAlert: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { countRecentFaceMismatches } from '@/lib/face-security'
import { rateLimit } from '@/lib/rate-limit'
import { verifyFaceForAttendance } from '@/lib/face-attendance'
import { encryptFaceDescriptor } from '@/lib/face-crypto'

// Real descriptors are 128-d (decryptFaceDescriptor rejects anything under 64-d as corrupt).
const DESCRIPTOR = Array.from({ length: 128 }, (_, i) => (i % 10) / 10)

const baseInput = {
  userId: 'user-1',
  liveDescriptor: DESCRIPTOR,
  livenessScore: 1,
  detectionScore: 0.9,
  action: 'checkin',
  method: 'face' as const,
  attendanceId: null,
  spoofFlags: null,
}

describe('verifyFaceForAttendance — server-side rate limit / lockout gate (Phase A item 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default happy-path mocks — individual tests override what they need to exercise.
    vi.mocked(countRecentFaceMismatches).mockResolvedValue(0)
    vi.mocked(rateLimit).mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 1000 })
  })

  it('blocks with RATE_LIMITED once recent mismatches hit the threshold — before touching the profile at all', async () => {
    vi.mocked(countRecentFaceMismatches).mockResolvedValue(5)

    const result = await verifyFaceForAttendance(baseInput)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('RATE_LIMITED')
    expect(prisma.userFaceProfile.findUnique).not.toHaveBeenCalled()
    expect(rateLimit).not.toHaveBeenCalled() // mismatch-lock is checked first, short-circuits
  })

  it('blocks with RATE_LIMITED when the rolling-window limiter says not allowed, even with zero mismatches', async () => {
    vi.mocked(countRecentFaceMismatches).mockResolvedValue(0)
    vi.mocked(rateLimit).mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 })

    const result = await verifyFaceForAttendance(baseInput)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('RATE_LIMITED')
    expect(prisma.userFaceProfile.findUnique).not.toHaveBeenCalled()
  })

  it('checks the rate limiter under a per-user key, not global', async () => {
    vi.mocked(rateLimit).mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 1000 })
    await verifyFaceForAttendance(baseInput)
    expect(rateLimit).toHaveBeenCalledWith(expect.stringContaining('user-1'), expect.any(Number), expect.any(Number))
  })

  it('does not block a legitimate first attempt — proceeds through to the actual descriptor match', async () => {
    vi.mocked(prisma.userFaceProfile.findUnique).mockResolvedValue({
      encryptedDescriptor: encryptFaceDescriptor(DESCRIPTOR),
    } as never)

    const result = await verifyFaceForAttendance({ ...baseInput, liveDescriptor: DESCRIPTOR })

    expect(countRecentFaceMismatches).toHaveBeenCalled()
    expect(rateLimit).toHaveBeenCalled()
    expect(prisma.userFaceProfile.findUnique).toHaveBeenCalled()
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true })
  })

  it('logs the rate-limit rejection as a security event with failureReason=rate_limited', async () => {
    vi.mocked(countRecentFaceMismatches).mockResolvedValue(5)
    await verifyFaceForAttendance(baseInput)
    expect(prisma.attendanceFaceLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failureReason: 'rate_limited', matched: false }),
      }),
    )
  })
})
