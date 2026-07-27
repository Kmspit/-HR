import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/prisma', () => ({
  prisma: {
    warningRule: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    attendance: { findMany: vi.fn() },
    warning: { findFirst: vi.fn(), create: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
    notification: { create: vi.fn().mockResolvedValue({}) },
  },
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

  it('always creates the warning as PENDING_APPROVAL — never auto-approved, matching warning-auto.ts', async () => {
    vi.mocked(prisma.warning.create).mockResolvedValue({ id: 'w-1', createdAt: new Date() } as never)
    await runWarningCheck({ userIds: ['user-1'] })
    expect(prisma.warning.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING_APPROVAL' }) }),
    )
  })
})

describe('runWarningCheck — upgrading an existing same-month warning to a higher level', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Level 1 off lateThreshold (matches warning-auto.ts's checkin-triggered
    // path), level 2 off absentThreshold — this month's attendance hits both.
    vi.mocked(prisma.warningRule).findMany.mockResolvedValue([
      { id: 'r1', level: 1, name: 'L1', lateThreshold: 3, absentThreshold: null, periodDays: 30, isActive: true, createdAt: new Date() },
      { id: 'r2', level: 2, name: 'L2', lateThreshold: null, absentThreshold: 1, periodDays: 30, isActive: true, createdAt: new Date() },
    ] as never)
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'user-1', name: 'พนักงาน' }] as never)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([
      { status: 'LATE' }, { status: 'LATE' }, { status: 'LATE' }, { status: 'ABSENT' },
    ] as never)
  })

  it('upgrades a PENDING_APPROVAL level-1 warning to level 2 when the fuller cron check qualifies for it', async () => {
    vi.mocked(prisma.warning.findFirst).mockResolvedValue({ id: 'w-1', level: 1, status: 'PENDING_APPROVAL' } as never)
    vi.mocked(prisma.warning.updateMany).mockResolvedValue({ count: 1 } as never)

    const issued = await runWarningCheck({ userIds: ['user-1'] })

    expect(prisma.warning.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'w-1', status: 'PENDING_APPROVAL' },
        data: expect.objectContaining({ level: 2 }),
      }),
    )
    expect(prisma.warning.create).not.toHaveBeenCalled()
    expect(issued).toHaveLength(1)
    expect(issued[0].level).toBe(2)
  })

  it('does not touch an already-APPROVED warning even if the new level would be higher', async () => {
    vi.mocked(prisma.warning.findFirst).mockResolvedValue({ id: 'w-1', level: 1, status: 'APPROVED' } as never)

    const issued = await runWarningCheck({ userIds: ['user-1'] })

    expect(prisma.warning.updateMany).not.toHaveBeenCalled()
    expect(prisma.warning.create).not.toHaveBeenCalled()
    expect(issued).toEqual([])
  })

  it('does not downgrade or touch a PENDING_APPROVAL warning that is already at or above the newly computed level', async () => {
    vi.mocked(prisma.warning.findFirst).mockResolvedValue({ id: 'w-1', level: 3, status: 'PENDING_APPROVAL' } as never)

    const issued = await runWarningCheck({ userIds: ['user-1'] })

    expect(prisma.warning.updateMany).not.toHaveBeenCalled()
    expect(issued).toEqual([])
  })

  it('backs off without crashing if a human approves/rejects the row between read and write (CAS race)', async () => {
    vi.mocked(prisma.warning.findFirst).mockResolvedValue({ id: 'w-1', level: 1, status: 'PENDING_APPROVAL' } as never)
    vi.mocked(prisma.warning.updateMany).mockResolvedValue({ count: 0 } as never)

    const issued = await runWarningCheck({ userIds: ['user-1'] })

    expect(issued).toEqual([])
  })
})
