import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/user-access', () => ({
  canAccessUserProfile: vi.fn(async () => true),
}))

import { prisma } from '@/lib/prisma'
import {
  canListCompanyWideRecords,
  resolveOrgListScope,
  userIdFilterFromScope,
} from '@/lib/org-scope'

describe('org-scope list helpers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('canListCompanyWideRecords includes HR roles', () => {
    expect(canListCompanyWideRecords('HR')).toBe(true)
    expect(canListCompanyWideRecords('MANAGER')).toBe(false)
    expect(canListCompanyWideRecords('TEAM_LEADER')).toBe(false)
  })

  it('resolveOrgListScope returns self for employee', async () => {
    const scope = await resolveOrgListScope(prisma, 'u1', 'EMPLOYEE')
    expect(scope).toEqual(['u1'])
  })

  it('resolveOrgListScope returns reports for manager', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'r1' }] as never)
    const scope = await resolveOrgListScope(prisma, 'mgr1', 'MANAGER')
    expect(scope).toEqual(['mgr1', 'r1'])
  })

  it('userIdFilterFromScope builds prisma filter', () => {
    expect(userIdFilterFromScope('ALL')).toEqual({})
    expect(userIdFilterFromScope(['u1'])).toEqual({ userId: 'u1' })
    expect(userIdFilterFromScope(['u1', 'u2'])).toEqual({ userId: { in: ['u1', 'u2'] } })
  })
})
