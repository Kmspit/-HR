import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { pagePermissionOverride: { findMany: vi.fn() } },
}))

import { prisma } from '@/lib/prisma'
import { canAccessPage } from '@/lib/page-access'
import { canAccessPageForUser } from '@/lib/page-access-server'
import { clearUserPagePermissionsCache } from '@/lib/user-page-permissions-cache'

/**
 * canAccessPageForUser() (2026-10-02) — the per-user override-aware check for
 * the curated path(s) in lib/override-eligible-paths.ts (only '/executive'
 * as of 2026-10-09 — /payroll and /reports were temporarily removed, see
 * that file's comment on the branch-scoping gap that motivated it). The
 * critical thing under test here: the "no override" fallback must use the
 * ORIGINAL (pre-widening) role list, never the now-widened ROUTE_PERMISSIONS
 * entry — using the widened value would make every role look allowed by
 * default, silently defeating RESTRICT and making GRANT meaningless.
 */
describe('canAccessPageForUser', () => {
  beforeEach(() => {
    vi.mocked(prisma.pagePermissionOverride.findMany).mockReset()
    clearUserPagePermissionsCache('u1')
  })

  it('no override row: falls back to the ORIGINAL role list, not the widened ALL_ROLES entry', async () => {
    vi.mocked(prisma.pagePermissionOverride.findMany).mockResolvedValue([])
    // MANAGER would pass canAccessPage('/executive') now (widened), but must
    // NOT pass canAccessPageForUser absent an explicit GRANT.
    expect(await canAccessPageForUser('u1', 'MANAGER', '/executive')).toBe(false)
    // A role that's actually in the original EXEC_ONLY list still passes.
    expect(await canAccessPageForUser('u1', 'CEO', '/executive')).toBe(true)
  })

  it('GRANT override opens a path the role would normally be denied', async () => {
    vi.mocked(prisma.pagePermissionOverride.findMany).mockResolvedValue([
      { path: '/executive', direction: 'GRANT' },
    ] as any)
    expect(await canAccessPageForUser('u1', 'MANAGER', '/executive')).toBe(true)
  })

  it('RESTRICT override closes a path the role would normally be allowed', async () => {
    vi.mocked(prisma.pagePermissionOverride.findMany).mockResolvedValue([
      { path: '/executive', direction: 'RESTRICT' },
    ] as any)
    expect(await canAccessPageForUser('u1', 'CEO', '/executive')).toBe(false)
  })

  it('a /payroll or /reports override row (stale — no longer eligible) has no effect, since those paths fall back to plain canAccessPage()', async () => {
    vi.mocked(prisma.pagePermissionOverride.findMany).mockResolvedValue([
      { path: '/payroll', direction: 'GRANT' },
      { path: '/reports', direction: 'GRANT' },
    ] as any)
    // /payroll and /reports are no longer in OVERRIDE_ELIGIBLE_PATHS — they
    // behave exactly like any other non-eligible path now: identical to
    // canAccessPage(), stale override rows ignored entirely.
    expect(await canAccessPageForUser('u1', 'EMPLOYEE', '/payroll')).toBe(canAccessPage('EMPLOYEE', '/payroll'))
    expect(await canAccessPageForUser('u1', 'MANAGER', '/reports')).toBe(canAccessPage('MANAGER', '/reports'))
  })

  it('non-eligible path: identical to canAccessPage(), never consults overrides at all', async () => {
    vi.mocked(prisma.pagePermissionOverride.findMany).mockResolvedValue([
      { path: '/settings', direction: 'GRANT' }, // hypothetical stray row — should be ignored
    ] as any)
    expect(await canAccessPageForUser('u1', 'EMPLOYEE', '/settings')).toBe(canAccessPage('EMPLOYEE', '/settings'))
    expect(await canAccessPageForUser('u1', 'HR', '/settings')).toBe(canAccessPage('HR', '/settings'))
    expect(prisma.pagePermissionOverride.findMany).not.toHaveBeenCalled()
  })
})
