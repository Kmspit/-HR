import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/prisma', () => ({
  prisma: {
    warning: { findFirst: vi.fn(), create: vi.fn() },
    attendance: { count: vi.fn() },
    user: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  },
}))

vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma'
import { checkAndCreateAutoWarning } from '@/lib/warning-auto'

function p2002() {
  const err = new Error('UNIQUE constraint failed: warnings.userId, warnings.month, warnings.year') as Error & { code: string }
  err.code = 'P2002'
  return err
}

describe('checkAndCreateAutoWarning — race with the run-check path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.warning.findFirst).mockResolvedValue(null as never)
    vi.mocked(prisma.attendance.count).mockResolvedValue(5 as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'admin-1' } as never)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ name: 'พนักงาน', department: null } as never)
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as never)
  })

  it('returns false (not an error) when the run-check path already created the warning first', async () => {
    vi.mocked(prisma.warning.create).mockRejectedValue(p2002())
    const result = await checkAndCreateAutoWarning('user-1')
    expect(result).toBe(false)
  })

  it('propagates a non-constraint error unchanged', async () => {
    vi.mocked(prisma.warning.create).mockRejectedValue(new Error('connection lost'))
    await expect(checkAndCreateAutoWarning('user-1')).rejects.toThrow('connection lost')
  })

  it('creates the warning normally when there is no race', async () => {
    vi.mocked(prisma.warning.create).mockResolvedValue({ id: 'w-1' } as never)
    const result = await checkAndCreateAutoWarning('user-1')
    expect(result).toBe(true)
    expect(prisma.warning.create).toHaveBeenCalledTimes(1)
  })
})
