/**
 * Brute-force login protection — Phase 15
 * 5 failed attempts within 15 min → account locked for 15 min
 */
import { prisma } from '@/lib/prisma'

const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000  // 15 min
const LOCK_MS   = 15 * 60 * 1000  // lock duration

export async function checkLoginAllowed(email: string): Promise<{ allowed: boolean; lockedUntil?: Date }> {
  const normalized = email.trim().toLowerCase()
  const user = await prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true, lockedUntil: true },
  })

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    return { allowed: false, lockedUntil: user.lockedUntil }
  }

  return { allowed: true }
}

/** Resolve employee ID or email → lock check on canonical account. */
export async function checkLoginAllowedForIdentifier(
  identifier: string,
): Promise<{ allowed: boolean; lockedUntil?: Date; email?: string; userId?: string }> {
  const raw = identifier.trim()
  if (!raw) return { allowed: true }

  if (raw.includes('@')) {
    const email = raw.toLowerCase()
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, lockedUntil: true },
    })
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      return { allowed: false, lockedUntil: user.lockedUntil, email: user.email, userId: user.id }
    }
    return { allowed: true, email: user?.email ?? email, userId: user?.id }
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { employeeId: raw },
        { employeeId: raw.toUpperCase() },
        { employeeId: raw.toLowerCase() },
      ],
    },
    select: { id: true, email: true, lockedUntil: true },
  })
  if (!user) return { allowed: true }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { allowed: false, lockedUntil: user.lockedUntil, email: user.email, userId: user.id }
  }
  return { allowed: true, email: user.email, userId: user.id }
}

export async function recordLoginAttempt(
  email: string,
  success: boolean,
  opts?: { ip?: string; userAgent?: string; userId?: string; reason?: string },
) {
  // Normalize the same way checkLoginAllowed/verifyLoginCredentials already do
  // — otherwise varying the email's case on each attempt splits the failure
  // count across separate buckets (bypassing the lockout entirely), and the
  // lock-application lookup below can silently miss the user row (stored
  // emails are always lowercase), so the account never actually gets locked.
  const normalized = email.trim().toLowerCase()

  await prisma.loginAttempt.create({
    data: {
      email: normalized,
      success,
      ip:        opts?.ip,
      userAgent: opts?.userAgent,
      userId:    opts?.userId,
      reason:    opts?.reason,
    },
  })

  if (success) {
    // Clear lock on successful login
    if (opts?.userId) {
      await prisma.user.update({ where: { id: opts.userId }, data: { lockedUntil: null } })
    }
    return
  }

  // Count recent failures
  const since = new Date(Date.now() - WINDOW_MS)
  const failures = await prisma.loginAttempt.count({
    where: { email: normalized, success: false, createdAt: { gte: since } },
  })

  if (failures >= MAX_ATTEMPTS) {
    const lockUntil = new Date(Date.now() + LOCK_MS)
    const user = await prisma.user.findUnique({ where: { email: normalized }, select: { id: true } })
    if (user) {
      await prisma.user.update({ where: { id: user.id }, data: { lockedUntil: lockUntil } })
      await prisma.securityEvent.create({
        data: {
          userId:      user.id,
          eventType:   'ACCOUNT_LOCKED',
          severity:    'CRITICAL',
          description: `Account locked after ${failures} failed login attempts`,
          ip:          opts?.ip,
          userAgent:   opts?.userAgent,
        },
      })
    }
  }
}
