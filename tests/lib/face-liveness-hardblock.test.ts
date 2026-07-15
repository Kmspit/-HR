import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userFaceProfile: { findUnique: vi.fn() },
    user: { findUnique: vi.fn().mockResolvedValue({ name: 'Test User' }) },
    attendanceFaceLog: {
      create: vi.fn().mockResolvedValue({ id: 'log-1' }),
      findFirst: vi.fn(),
    },
  },
}))

vi.mock('@/lib/face-security', () => ({
  countRecentFaceMismatches: vi.fn().mockResolvedValue(0),
  notifyFaceSecurityAlert: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 1000 }),
}))

import { prisma } from '@/lib/prisma'
import { verifyFaceForAttendance } from '@/lib/face-attendance'
import { encryptFaceDescriptor } from '@/lib/face-crypto'
import { hasCriticalSpoofFlags, serializeSpoofFlags } from '@/lib/face-liveness'

const DESCRIPTOR = Array.from({ length: 128 }, (_, i) => (i % 10) / 10)

const baseInput = {
  userId: 'user-1',
  liveDescriptor: DESCRIPTOR,
  livenessScore: 0.5,
  detectionScore: 0.9,
  action: 'checkin',
  method: 'face' as const,
  attendanceId: null,
}

describe('hasCriticalSpoofFlags — pure flag classification', () => {
  it('blocks static_frame on its own (pixel-level luminance signal, not behavioral)', () => {
    expect(hasCriticalSpoofFlags(['static_frame'])).toBe(true)
  })

  it('still blocks no_face and camera_not_ready as before', () => {
    expect(hasCriticalSpoofFlags(['no_face'])).toBe(true)
    expect(hasCriticalSpoofFlags(['camera_not_ready'])).toBe(true)
  })

  it('does NOT block no_blink or low_motion alone — normal for a real user in a short window', () => {
    expect(hasCriticalSpoofFlags(['no_blink'])).toBe(false)
    expect(hasCriticalSpoofFlags(['low_motion'])).toBe(false)
    expect(hasCriticalSpoofFlags(['no_blink', 'low_motion'])).toBe(false)
  })
})

describe('verifyFaceForAttendance — liveness hard-block (Phase A item 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.userFaceProfile.findUnique).mockResolvedValue({
      encryptedDescriptor: encryptFaceDescriptor(DESCRIPTOR),
    } as never)
    vi.mocked(prisma.attendanceFaceLog.findFirst).mockResolvedValue(null)
  })

  it('blocks immediately on static_frame, single occurrence', async () => {
    const result = await verifyFaceForAttendance({
      ...baseInput,
      spoofFlags: serializeSpoofFlags(['static_frame']),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('SPOOF')
  })

  it('does NOT block on the first occurrence of low_motion+no_blink (no prior matching log)', async () => {
    vi.mocked(prisma.attendanceFaceLog.findFirst).mockResolvedValue(null)
    const result = await verifyFaceForAttendance({
      ...baseInput,
      spoofFlags: serializeSpoofFlags(['low_motion', 'no_blink']),
    })
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true })
  })

  it('blocks on the SECOND consecutive low_motion+no_blink within the repeat window', async () => {
    vi.mocked(prisma.attendanceFaceLog.findFirst).mockResolvedValue({
      spoofFlags: serializeSpoofFlags(['low_motion', 'no_blink']),
    } as never)
    const result = await verifyFaceForAttendance({
      ...baseInput,
      spoofFlags: serializeSpoofFlags(['low_motion', 'no_blink']),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('SPOOF')
  })

  it('does not treat a single stale flag (e.g. only no_blink, no low_motion) as a repeat trigger', async () => {
    vi.mocked(prisma.attendanceFaceLog.findFirst).mockResolvedValue({
      spoofFlags: serializeSpoofFlags(['no_blink']), // low_motion absent — not the weak-liveness pattern
    } as never)
    const result = await verifyFaceForAttendance({
      ...baseInput,
      spoofFlags: serializeSpoofFlags(['no_blink']),
    })
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true })
  })

  it('only looks at recent history for the repeat check — queries within the repeat window', async () => {
    await verifyFaceForAttendance({
      ...baseInput,
      spoofFlags: serializeSpoofFlags(['low_motion', 'no_blink']),
    })
    expect(prisma.attendanceFaceLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          method: 'face',
          createdAt: expect.objectContaining({ gte: expect.any(Date) }),
        }),
      }),
    )
  })

  it('genuinely still employee (no motion, but did blink) is not penalized at all', async () => {
    const result = await verifyFaceForAttendance({
      ...baseInput,
      spoofFlags: serializeSpoofFlags(['low_motion']), // blinked, so no_blink absent
    })
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true })
    expect(prisma.attendanceFaceLog.findFirst).not.toHaveBeenCalled()
  })
})
