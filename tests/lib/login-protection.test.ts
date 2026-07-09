import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    loginAttempt: { create: vi.fn().mockResolvedValue({}), count: vi.fn() },
    securityEvent: { create: vi.fn().mockResolvedValue({}) },
  },
}))

import { prisma } from '@/lib/prisma'
import { recordLoginAttempt } from '@/lib/login-protection'

describe('recordLoginAttempt — normalizes email case (matches checkLoginAllowed/verifyLoginCredentials)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('stores the failure record with a lowercased email regardless of the case typed', async () => {
    vi.mocked(prisma.loginAttempt.count).mockResolvedValue(1 as never)
    await recordLoginAttempt('User@Example.COM', false, {})
    expect(prisma.loginAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: 'user@example.com' }) }),
    )
  })

  it('counts failures using the normalized email, so varying case cannot split the counter across buckets', async () => {
    vi.mocked(prisma.loginAttempt.count).mockResolvedValue(4 as never)
    await recordLoginAttempt('UsEr@Example.com', false, {})
    expect(prisma.loginAttempt.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ email: 'user@example.com' }) }),
    )
  })

  it('applies the lock using the normalized email — matches how emails are actually stored (always lowercase)', async () => {
    vi.mocked(prisma.loginAttempt.count).mockResolvedValue(5 as never) // hits MAX_ATTEMPTS
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1' } as never)
    await recordLoginAttempt('User@Example.com', false, {})
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'user@example.com' } }),
    )
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' } }),
    )
  })

  it('does not touch the lock counter on a successful login', async () => {
    await recordLoginAttempt('User@Example.com', true, { userId: 'u1' })
    expect(prisma.loginAttempt.count).not.toHaveBeenCalled()
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { lockedUntil: null } })
  })
})
