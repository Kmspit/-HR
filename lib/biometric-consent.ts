import { prisma } from '@/lib/prisma'

/** Current consent text version — bump this (and CONSENT_TEXT) whenever the wording
 *  changes materially; a version bump does NOT retroactively invalidate old GRANTED
 *  records, it's just recorded alongside each consent event for audit purposes. */
export const CONSENT_VERSION = '1.0'

export type ConsentAction = 'GRANTED' | 'REVOKED'
export type ConsentMethod = 'CHECKBOX' | 'DIGITAL_SIGNATURE'

/** Date the biometric-consent requirement went live. The 7-day (default) grace
 *  period for users who already had a UserFaceProfile before this date counts from
 *  THIS fixed date, not from each person's individual enrollment date — so the
 *  grace period ends for everyone at the same time regardless of when they enrolled. */
export const BIOMETRIC_CONSENT_REQUIRED_FROM = new Date('2026-09-09T00:00:00+07:00')

const DEFAULT_GRACE_PERIOD_DAYS = 7

/** Configurable via env so legal/HR can change it later without a code deploy. */
export function getGracePeriodDays(): number {
  const raw = process.env.BIOMETRIC_CONSENT_GRACE_PERIOD_DAYS
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_GRACE_PERIOD_DAYS
}

export function gracePeriodEndsAt(): Date {
  const end = new Date(BIOMETRIC_CONSENT_REQUIRED_FROM)
  end.setDate(end.getDate() + getGracePeriodDays())
  return end
}

export function isPastGracePeriod(now: Date = new Date()): boolean {
  return now.getTime() >= gracePeriodEndsAt().getTime()
}

export function daysRemainingInGracePeriod(now: Date = new Date()): number {
  const ms = gracePeriodEndsAt().getTime() - now.getTime()
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)))
}

export async function getLatestConsentAction(userId: string): Promise<ConsentAction | null> {
  const row = await prisma.biometricConsent.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { action: true },
  })
  return (row?.action as ConsentAction | undefined) ?? null
}

/**
 * Whether face-recognition may currently be used for this user.
 *
 * - Explicit REVOKED always wins, regardless of grace period.
 * - Explicit GRANTED always passes.
 * - No consent record at all: only passes during the grace period, and only for a
 *   profile that already existed before BIOMETRIC_CONSENT_REQUIRED_FROM (pass its
 *   registeredAt as `legacyProfileCreatedAt`). A brand-new enrollment must always
 *   have explicit GRANTED consent — omit `legacyProfileCreatedAt` (or pass null) to
 *   enforce that.
 */
export async function hasValidFaceConsent(
  userId: string,
  legacyProfileCreatedAt?: Date | null,
): Promise<boolean> {
  const latest = await getLatestConsentAction(userId)
  if (latest === 'REVOKED') return false
  if (latest === 'GRANTED') return true

  if (legacyProfileCreatedAt && legacyProfileCreatedAt < BIOMETRIC_CONSENT_REQUIRED_FROM) {
    return !isPastGracePeriod()
  }
  return false
}

export async function recordConsentAction(params: {
  userId: string
  action: ConsentAction
  consentVersion?: string
  consentText: string
  method: ConsentMethod
  scrolledToEnd: boolean
  ipAddress?: string | null
  userAgent?: string | null
  deviceKey?: string | null
}) {
  return prisma.biometricConsent.create({
    data: {
      userId: params.userId,
      action: params.action,
      consentVersion: params.consentVersion ?? CONSENT_VERSION,
      consentText: params.consentText,
      method: params.method,
      scrolledToEnd: params.scrolledToEnd,
      ipAddress: params.ipAddress ?? undefined,
      userAgent: params.userAgent ?? undefined,
      deviceKey: params.deviceKey ?? undefined,
    },
  })
}
