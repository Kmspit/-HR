import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    biometricConsent: { findFirst: vi.fn(), create: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import {
  BIOMETRIC_CONSENT_REQUIRED_FROM,
  getGracePeriodDays,
  gracePeriodEndsAt,
  isPastGracePeriod,
  daysRemainingInGracePeriod,
  getLatestConsentAction,
  hasValidFaceConsent,
  recordConsentAction,
} from '@/lib/biometric-consent'

describe('biometric-consent — grace period config', () => {
  const ORIGINAL_ENV = process.env.BIOMETRIC_CONSENT_GRACE_PERIOD_DAYS

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.BIOMETRIC_CONSENT_GRACE_PERIOD_DAYS
    else process.env.BIOMETRIC_CONSENT_GRACE_PERIOD_DAYS = ORIGINAL_ENV
  })

  it('defaults to 7 days when the env var is unset', () => {
    delete process.env.BIOMETRIC_CONSENT_GRACE_PERIOD_DAYS
    expect(getGracePeriodDays()).toBe(7)
  })

  it('reads a valid override from the env var', () => {
    process.env.BIOMETRIC_CONSENT_GRACE_PERIOD_DAYS = '14'
    expect(getGracePeriodDays()).toBe(14)
  })

  it('falls back to the default for a non-numeric or negative override', () => {
    process.env.BIOMETRIC_CONSENT_GRACE_PERIOD_DAYS = 'nope'
    expect(getGracePeriodDays()).toBe(7)
    process.env.BIOMETRIC_CONSENT_GRACE_PERIOD_DAYS = '-3'
    expect(getGracePeriodDays()).toBe(7)
  })

  it('counts the grace period from the fixed launch date, not from now', () => {
    process.env.BIOMETRIC_CONSENT_GRACE_PERIOD_DAYS = '7'
    const expected = new Date(BIOMETRIC_CONSENT_REQUIRED_FROM)
    expected.setDate(expected.getDate() + 7)
    expect(gracePeriodEndsAt().getTime()).toBe(expected.getTime())
  })

  it('isPastGracePeriod is false right at the launch date and true well after it ends', () => {
    process.env.BIOMETRIC_CONSENT_GRACE_PERIOD_DAYS = '7'
    expect(isPastGracePeriod(BIOMETRIC_CONSENT_REQUIRED_FROM)).toBe(false)
    const wellAfter = new Date(gracePeriodEndsAt().getTime() + 1000)
    expect(isPastGracePeriod(wellAfter)).toBe(true)
  })

  it('daysRemainingInGracePeriod never goes negative once the period has ended', () => {
    process.env.BIOMETRIC_CONSENT_GRACE_PERIOD_DAYS = '7'
    const wellAfter = new Date(gracePeriodEndsAt().getTime() + 100 * 24 * 60 * 60 * 1000)
    expect(daysRemainingInGracePeriod(wellAfter)).toBe(0)
  })
})

describe('getLatestConsentAction', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns null when no consent record exists', async () => {
    vi.mocked(prisma.biometricConsent.findFirst).mockResolvedValue(null as never)
    expect(await getLatestConsentAction('u1')).toBeNull()
  })

  it('returns the most recent action, ordered by createdAt desc', async () => {
    vi.mocked(prisma.biometricConsent.findFirst).mockResolvedValue({ action: 'REVOKED' } as never)
    expect(await getLatestConsentAction('u1')).toBe('REVOKED')
    expect(prisma.biometricConsent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' }, orderBy: { createdAt: 'desc' } }),
    )
  })
})

describe('hasValidFaceConsent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.BIOMETRIC_CONSENT_GRACE_PERIOD_DAYS
  })

  it('is true when the latest action is GRANTED', async () => {
    vi.mocked(prisma.biometricConsent.findFirst).mockResolvedValue({ action: 'GRANTED' } as never)
    expect(await hasValidFaceConsent('u1')).toBe(true)
  })

  it('is false when the latest action is REVOKED, even during the grace period', async () => {
    vi.mocked(prisma.biometricConsent.findFirst).mockResolvedValue({ action: 'REVOKED' } as never)
    const legacyDate = new Date(BIOMETRIC_CONSENT_REQUIRED_FROM.getTime() - 1000)
    expect(await hasValidFaceConsent('u1', legacyDate)).toBe(false)
  })

  it('is false for a brand-new enrollment with no consent record (no legacy date given)', async () => {
    vi.mocked(prisma.biometricConsent.findFirst).mockResolvedValue(null as never)
    expect(await hasValidFaceConsent('u1')).toBe(false)
  })

  it('is true for a legacy profile (created before the launch date) with no consent record, during the grace period', async () => {
    vi.mocked(prisma.biometricConsent.findFirst).mockResolvedValue(null as never)
    const legacyDate = new Date(BIOMETRIC_CONSENT_REQUIRED_FROM.getTime() - 1000)
    expect(await hasValidFaceConsent('u1', legacyDate)).toBe(true)
  })

  it('is false for a legacy profile with no consent record once the grace period has passed', async () => {
    vi.mocked(prisma.biometricConsent.findFirst).mockResolvedValue(null as never)
    const legacyDate = new Date(BIOMETRIC_CONSENT_REQUIRED_FROM.getTime() - 1000)
    const farFuture = new Date(gracePeriodEndsAt().getTime() + 24 * 60 * 60 * 1000)
    vi.useFakeTimers()
    vi.setSystemTime(farFuture)
    try {
      expect(await hasValidFaceConsent('u1', legacyDate)).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not extend the grace period to a profile created after the launch date', async () => {
    vi.mocked(prisma.biometricConsent.findFirst).mockResolvedValue(null as never)
    const newProfileDate = new Date(BIOMETRIC_CONSENT_REQUIRED_FROM.getTime() + 1000)
    expect(await hasValidFaceConsent('u1', newProfileDate)).toBe(false)
  })
})

describe('recordConsentAction', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes a new row with the given fields and the default consent version', async () => {
    vi.mocked(prisma.biometricConsent.create).mockResolvedValue({ id: 'c1', action: 'GRANTED' } as never)
    await recordConsentAction({
      userId: 'u1',
      action: 'GRANTED',
      consentText: 'text',
      method: 'CHECKBOX',
      scrolledToEnd: true,
      ipAddress: '1.2.3.4',
      userAgent: 'ua',
    })
    expect(prisma.biometricConsent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        action: 'GRANTED',
        consentVersion: '1.0',
        method: 'CHECKBOX',
        scrolledToEnd: true,
        ipAddress: '1.2.3.4',
        userAgent: 'ua',
      }),
    })
  })
})
