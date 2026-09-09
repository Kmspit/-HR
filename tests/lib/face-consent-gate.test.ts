import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userFaceProfile: { findUnique: vi.fn() },
    biometricConsent: { findFirst: vi.fn() },
    attendanceFaceLog: { create: vi.fn().mockResolvedValue({ id: 'log-1' }) },
    user: { findUnique: vi.fn().mockResolvedValue({ name: 'Test User' }) },
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
import { shouldRequireFaceVerification, verifyFaceForAttendance } from '@/lib/face-attendance'
import { BIOMETRIC_CONSENT_REQUIRED_FROM } from '@/lib/biometric-consent'

const LEGACY_DATE = new Date(BIOMETRIC_CONSENT_REQUIRED_FROM.getTime() - 1000)
const NEW_DATE = new Date(BIOMETRIC_CONSENT_REQUIRED_FROM.getTime() + 1000)

describe('shouldRequireFaceVerification — profile + consent combined gate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('is false when no profile exists at all', async () => {
    vi.mocked(prisma.userFaceProfile.findUnique).mockResolvedValue(null as never)
    expect(await shouldRequireFaceVerification('u1')).toBe(false)
    expect(prisma.biometricConsent.findFirst).not.toHaveBeenCalled()
  })

  it('is true when a profile exists and consent is GRANTED', async () => {
    vi.mocked(prisma.userFaceProfile.findUnique).mockResolvedValue({ registeredAt: NEW_DATE } as never)
    vi.mocked(prisma.biometricConsent.findFirst).mockResolvedValue({ action: 'GRANTED' } as never)
    expect(await shouldRequireFaceVerification('u1')).toBe(true)
  })

  it('is false when a profile exists but consent was REVOKED — soft fallback to manual', async () => {
    vi.mocked(prisma.userFaceProfile.findUnique).mockResolvedValue({ registeredAt: NEW_DATE } as never)
    vi.mocked(prisma.biometricConsent.findFirst).mockResolvedValue({ action: 'REVOKED' } as never)
    expect(await shouldRequireFaceVerification('u1')).toBe(false)
  })

  it('is true for a legacy profile with no consent record during the grace period', async () => {
    vi.mocked(prisma.userFaceProfile.findUnique).mockResolvedValue({ registeredAt: LEGACY_DATE } as never)
    vi.mocked(prisma.biometricConsent.findFirst).mockResolvedValue(null as never)
    expect(await shouldRequireFaceVerification('u1')).toBe(true)
  })
})

describe('verifyFaceForAttendance — method=manual now soft-falls-back instead of hard FACE_REQUIRED', () => {
  const baseInput = {
    userId: 'u1',
    liveDescriptor: [],
    livenessScore: 0,
    action: 'checkin',
    method: 'manual' as const,
    attendanceId: null,
    spoofFlags: null,
  }

  beforeEach(() => vi.clearAllMocks())

  it('rejects manual with FACE_REQUIRED when the user has a profile and valid consent', async () => {
    vi.mocked(prisma.userFaceProfile.findUnique).mockResolvedValue({ registeredAt: NEW_DATE } as never)
    vi.mocked(prisma.biometricConsent.findFirst).mockResolvedValue({ action: 'GRANTED' } as never)

    const result = await verifyFaceForAttendance(baseInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('FACE_REQUIRED')
  })

  it('allows manual when the user has a profile but consent was REVOKED', async () => {
    vi.mocked(prisma.userFaceProfile.findUnique).mockResolvedValue({ registeredAt: NEW_DATE } as never)
    vi.mocked(prisma.biometricConsent.findFirst).mockResolvedValue({ action: 'REVOKED' } as never)

    const result = await verifyFaceForAttendance(baseInput)
    expect(result.ok).toBe(true)
  })

  it('allows manual when no profile exists at all (unchanged prior behavior)', async () => {
    vi.mocked(prisma.userFaceProfile.findUnique).mockResolvedValue(null as never)

    const result = await verifyFaceForAttendance(baseInput)
    expect(result.ok).toBe(true)
  })
})
