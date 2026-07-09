import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findFirst: vi.fn() } },
}))

vi.mock('bcryptjs', () => ({
  default: { compare: vi.fn() },
}))

import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { verifyLoginCredentials } from '@/lib/login-credentials'

const baseUser = {
  id: 'u1', email: 'user@x.com', name: 'User', role: 'EMPLOYEE', status: 'ACTIVE',
  department: null, branchId: null, passwordHash: '$2a$10$hash', lockedUntil: null,
}

describe('verifyLoginCredentials — account-status failures are generic to the caller (anti-enumeration)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns plain INVALID_CREDENTIALS (no reason) for an unknown email', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null as never)
    const result = await verifyLoginCredentials('nobody@x.com', 'pw')
    expect(result).toEqual({ ok: false, error: 'INVALID_CREDENTIALS' })
  })

  it('locked account: error is the same generic code, real reason only in `reason`', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      ...baseUser, lockedUntil: new Date(Date.now() + 60_000),
    } as never)
    const result = await verifyLoginCredentials('user@x.com', 'pw')
    expect(result).toEqual({ ok: false, error: 'INVALID_CREDENTIALS', reason: 'ACCOUNT_LOCKED' })
  })

  it('pending-approval account: generic error, even though the password would have been correct', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ ...baseUser, status: 'PENDING' } as never)
    const result = await verifyLoginCredentials('user@x.com', 'pw')
    expect(result).toEqual({ ok: false, error: 'INVALID_CREDENTIALS', reason: 'PENDING_APPROVAL' })
    // Must not even reach bcrypt — status is checked first, so no timing/behavior difference
    // that could hint the password was right.
    expect(bcrypt.compare).not.toHaveBeenCalled()
  })

  it('disabled account: generic error', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ ...baseUser, status: 'DISABLED' } as never)
    const result = await verifyLoginCredentials('user@x.com', 'pw')
    expect(result).toEqual({ ok: false, error: 'INVALID_CREDENTIALS', reason: 'ACCOUNT_DISABLED' })
  })

  it('rejected account: generic error', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ ...baseUser, status: 'REJECTED' } as never)
    const result = await verifyLoginCredentials('user@x.com', 'pw')
    expect(result).toEqual({ ok: false, error: 'INVALID_CREDENTIALS', reason: 'ACCOUNT_REJECTED' })
  })

  it('wrong password on an active account: same generic error, no reason', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(baseUser as never)
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never)
    const result = await verifyLoginCredentials('user@x.com', 'wrong')
    expect(result).toEqual({ ok: false, error: 'INVALID_CREDENTIALS' })
  })

  it('succeeds for an active account with the correct password', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(baseUser as never)
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never)
    const result = await verifyLoginCredentials('user@x.com', 'right')
    expect(result.ok).toBe(true)
  })
})
