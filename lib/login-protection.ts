/**
 * Brute-force login protection — Phase 15
 * 5 failed attempts within 15 min → account locked for 15 min
 */
import { prisma } from '@/lib/prisma'

const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000  // 15 min
const LOCK_MS   = 15 * 60 * 1000  // lock duration

export async function checkLoginAllowed(email: string): Promise<{ allowed: boolean; lockedUntil?: Date }> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, lockedUntil: true },
  })

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    return { allowed: false, lockedUntil: user.lockedUntil }
  }

  return { allowed: true }
}

export async function recordLoginAttempt(
  email: string,
  success: boolean,
  opts?: { ip?: string; userAgent?: string; userId?: string; reason?: string },
) {
  await prisma.loginAttempt.create({
    data: {
      email,
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
    where: { email, success: false, createdAt: { gte: since } },
  })

  if (failures >= MAX_ATTEMPTS) {
    const lockUntil = new Date(Date.now() + LOCK_MS)
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } })
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
