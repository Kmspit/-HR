import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { pagePermissionOverride: { findMany: vi.fn() } },
}))

import { prisma } from '@/lib/prisma'
import { canAccessExecutiveApi } from '@/lib/executive-api'
import { clearUserPagePermissionsCache } from '@/lib/user-page-permissions-cache'

describe('canAccessExecutiveApi', () => {
  beforeEach(() => {
    vi.mocked(prisma.pagePermissionOverride.findMany).mockResolvedValue([])
    clearUserPagePermissionsCache('u1')
  })

  it('allows CEO and SUPER_ADMIN only, by default', async () => {
    expect(await canAccessExecutiveApi('u1', 'CEO')).toBe(true)
    expect(await canAccessExecutiveApi('u1', 'SUPER_ADMIN')).toBe(true)
  })

  it('blocks MANAGER and HR, by default', async () => {
    expect(await canAccessExecutiveApi('u1', 'MANAGER')).toBe(false)
    expect(await canAccessExecutiveApi('u1', 'HR')).toBe(false)
    expect(await canAccessExecutiveApi('u1', 'MANAGER_HR')).toBe(false)
  })

  it('a GRANT override lets a non-exec role through (2026-10-02)', async () => {
    vi.mocked(prisma.pagePermissionOverride.findMany).mockResolvedValue([
      { path: '/executive', direction: 'GRANT' },
    ] as any)
    expect(await canAccessExecutiveApi('u1', 'MANAGER')).toBe(true)
  })

  it('a RESTRICT override blocks CEO/SUPER_ADMIN too', async () => {
    vi.mocked(prisma.pagePermissionOverride.findMany).mockResolvedValue([
      { path: '/executive', direction: 'RESTRICT' },
    ] as any)
    expect(await canAccessExecutiveApi('u1', 'CEO')).toBe(false)
  })
})
