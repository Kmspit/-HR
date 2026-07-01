import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/access-control', () => ({
  hasPermission: vi.fn((role: string, perm: string) => {
    if (role === 'EMPLOYEE' && perm === 'view_all_dashboard') return false
    if (role === 'HR' && perm === 'view_all_dashboard') return true
    return false
  }),
}))
vi.mock('@/lib/user-access', () => ({
  canAccessUserProfile: vi.fn(async () => true),
}))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { auth } from '@/lib/auth'
import { requireAuth, requirePermission, requireRoles, isGuardResponse } from '@/lib/api-guard'

describe('api-guard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requireAuth returns 401 when no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const result = await requireAuth()
    expect(isGuardResponse(result)).toBe(true)
    expect((result as NextResponse).status).toBe(401)
  })

  it('requirePermission returns 403 for EMPLOYEE without permission', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'u1', role: 'EMPLOYEE', branchId: null },
    } as never)
    const result = await requirePermission('view_all_dashboard')
    expect(isGuardResponse(result)).toBe(true)
    expect((result as NextResponse).status).toBe(403)
  })

  it('requireRoles allows MANAGER_HR for settings', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'u1', role: 'MANAGER_HR', branchId: null },
    } as never)
    const result = await requireRoles(['MANAGER_HR', 'ADMIN'])
    expect(isGuardResponse(result)).toBe(false)
    expect(result).toMatchObject({ user: { role: 'MANAGER_HR' } })
  })
})
