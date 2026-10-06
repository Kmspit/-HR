import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { pagePermissionOverride: { findMany: vi.fn() } },
}))

import { prisma } from '@/lib/prisma'
import { getCachedUserPagePermissions, clearUserPagePermissionsCache } from '@/lib/user-page-permissions-cache'

/**
 * Same 45s in-memory TTL cache pattern as lib/company-settings-cache.ts /
 * lib/line-credentials.ts, keyed per-user. This is on the hot path for every
 * page/API check on the 3 override-eligible paths (lib/page-access-server.ts),
 * so it must genuinely avoid re-querying within the TTL, and must never 500
 * the request if the DB read fails.
 */
describe('user-page-permissions-cache', () => {
  beforeEach(() => {
    vi.mocked(prisma.pagePermissionOverride.findMany).mockReset()
    clearUserPagePermissionsCache('u1')
    clearUserPagePermissionsCache('u2')
    vi.useRealTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('fetches from the DB on first call', async () => {
    vi.mocked(prisma.pagePermissionOverride.findMany).mockResolvedValue([
      { path: '/payroll', direction: 'GRANT' },
    ] as any)
    const result = await getCachedUserPagePermissions('u1')
    expect(result).toEqual([{ path: '/payroll', direction: 'GRANT' }])
    expect(prisma.pagePermissionOverride.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.pagePermissionOverride.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      select: { path: true, direction: true },
    })
  })

  it('does not re-query within the TTL for the same user', async () => {
    vi.mocked(prisma.pagePermissionOverride.findMany).mockResolvedValue([])
    await getCachedUserPagePermissions('u1')
    await getCachedUserPagePermissions('u1')
    await getCachedUserPagePermissions('u1')
    expect(prisma.pagePermissionOverride.findMany).toHaveBeenCalledTimes(1)
  })

  it('caches different users independently', async () => {
    vi.mocked(prisma.pagePermissionOverride.findMany).mockResolvedValue([])
    await getCachedUserPagePermissions('u1')
    await getCachedUserPagePermissions('u2')
    expect(prisma.pagePermissionOverride.findMany).toHaveBeenCalledTimes(2)
  })

  it('clearUserPagePermissionsCache forces a fresh fetch on the next call', async () => {
    vi.mocked(prisma.pagePermissionOverride.findMany).mockResolvedValue([])
    await getCachedUserPagePermissions('u1')
    clearUserPagePermissionsCache('u1')
    await getCachedUserPagePermissions('u1')
    expect(prisma.pagePermissionOverride.findMany).toHaveBeenCalledTimes(2)
  })

  it('clearing one user does not evict another', async () => {
    vi.mocked(prisma.pagePermissionOverride.findMany).mockResolvedValue([])
    await getCachedUserPagePermissions('u1')
    await getCachedUserPagePermissions('u2')
    clearUserPagePermissionsCache('u1')
    await getCachedUserPagePermissions('u1')
    await getCachedUserPagePermissions('u2')
    expect(prisma.pagePermissionOverride.findMany).toHaveBeenCalledTimes(3) // u1, u2, u1-again (u2 still cached)
  })

  it('degrades to [] (role-only fallback) rather than throwing when the DB read fails', async () => {
    vi.mocked(prisma.pagePermissionOverride.findMany).mockRejectedValue(new Error('db down'))
    const result = await getCachedUserPagePermissions('u1')
    expect(result).toEqual([])
  })

  it('re-fetches once the TTL expires', async () => {
    vi.useFakeTimers()
    vi.mocked(prisma.pagePermissionOverride.findMany).mockResolvedValue([])
    await getCachedUserPagePermissions('u1')
    vi.advanceTimersByTime(46_000)
    await getCachedUserPagePermissions('u1')
    expect(prisma.pagePermissionOverride.findMany).toHaveBeenCalledTimes(2)
  })
})
