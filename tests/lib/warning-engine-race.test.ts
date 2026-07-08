import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/prisma', () => ({
  prisma: {
    warningRule: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    attendance: { findMany: vi.fn() },
    warning: { findFirst: vi.fn(), create: vi.fn(), count: vi.fn() },
    notification: { create: vi.fn().mockResolvedValue({}) },
  },
}))

vi.mock('@/lib/warning-delivery', () => ({
  deliverWarningToEmployee: vi.fn().mockResolvedValue(undefined),
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma'
import { runWarningCheck } from '@/lib/warningEngine'

function p2002() {
  const err = new Error('UNIQUE constraint failed: warnings.userId, warnings.month, warnings.year') as Error & { code: string }
  err.code = 'P2002'
  return err
}

describe('runWarningCheck — race with the checkin-triggered auto-warning path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.warningRule).findMany.mockResolvedValue([
      { id: 'r1', level: 1, name: 'L1', lateThreshold: 3, absentThreshold: null, periodDays: 30, isActive: true, createdAt: new Date() },
    ] as never)
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'user-1', name: 'พนักงาน' }] as never)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([
      { status: 'LATE' }, { status: 'LATE' }, { status: 'LATE' },
    ] as never)
    vi.mocked(prisma.warning.findFirst).mockResolvedValue(null as never)
    vi.mocked(prisma.warning.count).mockResolvedValue(1 as never)
  })

  it('skips the employee (no throw) when the checkin-triggered path already created the warning first', async () => {
    vi.mocked(prisma.warning.create).mockRejectedValue(p2002())
    const issued = await runWarningCheck({ userIds: ['user-1'] })
    expect(issued).toEqual([])
  })

  it('propagates a non-constraint error unchanged', async () => {
    vi.mocked(prisma.warning.create).mockRejectedValue(new Error('connection lost'))
    await expect(runWarningCheck({ userIds: ['user-1'] })).rejects.toThrow('connection lost')
  })

  it('issues the warning normally when there is no race', async () => {
    vi.mocked(prisma.warning.create).mockResolvedValue({ id: 'w-1', createdAt: new Date() } as never)
    const issued = await runWarningCheck({ userIds: ['user-1'] })
    expect(issued).toHaveLength(1)
    expect(issued[0].userId).toBe('user-1')
  })
})
