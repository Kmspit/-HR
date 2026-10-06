import { describe, it, expect } from 'vitest'
import type { Role } from '@prisma/client'
import {
  resolveFilterBranchId,
  branchUserWhere,
  branchNestedUserWhere,
  attendanceWhere,
  requestUserWhere,
  isUserInBranchScope,
  ALL_BRANCHES_ROLES,
  NO_BRANCH_ACCESS_ID,
  type BranchScopeInput,
} from '@/lib/branch-scope'

// Every Role in prisma/schema.prisma, split by the 2026-10 fail-close line.
const ALLOW_LISTED: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']
const LOCKED: Role[] = ['MANAGER', 'TEAM_LEADER', 'EMPLOYEE', 'LAWYER', 'ENFORCEMENT', 'CLIENT']

function scope(role: Role, userBranchId: string | null | undefined, filterBranchId?: string | null): BranchScopeInput {
  return { role, userBranchId, filterBranchId }
}

describe('ALL_BRANCHES_ROLES — exactly the 5-role fail-close allow-list', () => {
  it('is exactly SUPER_ADMIN, CEO, MANAGER_HR, HR, ADMIN — nothing more, nothing less', () => {
    expect([...ALL_BRANCHES_ROLES].sort()).toEqual([...ALLOW_LISTED].sort())
  })
})

describe('resolveFilterBranchId — allow-listed roles (SUPER_ADMIN/CEO/MANAGER_HR/HR/ADMIN): unchanged 100%', () => {
  it.each(ALLOW_LISTED)('%s with no ?branchId= sees all branches (undefined)', (role) => {
    expect(resolveFilterBranchId(scope(role, 'branch-own'))).toBeUndefined()
    expect(resolveFilterBranchId(scope(role, null))).toBeUndefined()
  })

  it.each(ALLOW_LISTED)('%s with ?branchId=all sees all branches (undefined)', (role) => {
    expect(resolveFilterBranchId(scope(role, 'branch-own', 'all'))).toBeUndefined()
  })

  it.each(ALLOW_LISTED)('%s with ?branchId=branch-x narrows to branch-x', (role) => {
    expect(resolveFilterBranchId(scope(role, 'branch-own', 'branch-x'))).toBe('branch-x')
  })

  it.each(ALLOW_LISTED)('%s with a null own branchId still sees all branches (unaffected by the fail-close)', (role) => {
    expect(resolveFilterBranchId(scope(role, null))).toBeUndefined()
  })
})

describe('resolveFilterBranchId — every other role: locked to own branch, URL filter ignored', () => {
  it.each(LOCKED)('%s with a branch of their own is locked to it regardless of ?branchId=', (role) => {
    expect(resolveFilterBranchId(scope(role, 'branch-own'))).toBe('branch-own')
    expect(resolveFilterBranchId(scope(role, 'branch-own', 'branch-other'))).toBe('branch-own')
    expect(resolveFilterBranchId(scope(role, 'branch-own', 'all'))).toBe('branch-own')
  })

  it.each(LOCKED)('%s with no branch of their own gets the zero-rows sentinel, never undefined', (role) => {
    expect(resolveFilterBranchId(scope(role, null))).toBe(NO_BRANCH_ACCESS_ID)
    expect(resolveFilterBranchId(scope(role, null, 'branch-other'))).toBe(NO_BRANCH_ACCESS_ID)
    expect(resolveFilterBranchId(scope(role, null, 'all'))).toBe(NO_BRANCH_ACCESS_ID)
    expect(resolveFilterBranchId(scope(role, undefined))).toBe(NO_BRANCH_ACCESS_ID)
  })
})

describe('wrapper functions resolve the zero-rows sentinel into a where clause that matches nothing', () => {
  const noBranchManager = scope('MANAGER', null)

  it('branchUserWhere sets branchId to the sentinel (never equals a real cuid)', () => {
    const where = branchUserWhere(noBranchManager, { status: 'ACTIVE' })
    expect(where).toEqual({ status: 'ACTIVE', branchId: NO_BRANCH_ACCESS_ID })
  })

  it('branchNestedUserWhere returns a defined (truthy) nested filter, not undefined', () => {
    const nested = branchNestedUserWhere(noBranchManager)
    expect(nested).toEqual({ branchId: NO_BRANCH_ACCESS_ID })
  })

  it('attendanceWhere nests the sentinel under `user`, it does not fall back to "no filter"', () => {
    const where = attendanceWhere(noBranchManager, { date: new Date('2026-10-01') })
    expect(where).toEqual({ date: new Date('2026-10-01'), user: { branchId: NO_BRANCH_ACCESS_ID } })
  })

  it('requestUserWhere nests the sentinel under `user`, it does not fall back to "no filter"', () => {
    const where = requestUserWhere(noBranchManager, { status: 'PENDING' })
    expect(where).toEqual({ status: 'PENDING', user: { branchId: NO_BRANCH_ACCESS_ID } })
  })

  it('isUserInBranchScope returns false — a fake prisma.user.findFirst never matches the sentinel branchId', async () => {
    const fakePrisma = {
      user: {
        findFirst: async ({ where }: { where: Record<string, unknown> }) => {
          // Mirrors real Prisma/SQLite semantics: no row's branchId equals the sentinel.
          return where.branchId === NO_BRANCH_ACCESS_ID ? null : { id: 'target-1' }
        },
      },
    }
    const result = await isUserInBranchScope(fakePrisma as any, noBranchManager, 'target-1')
    expect(result).toBe(false)
  })
})

describe('wrapper functions preserve "see all branches" exactly for allow-listed roles with no filter', () => {
  const hrAllBranches = scope('HR', null)

  it('branchUserWhere — payroll generate for HR must still list users across every branch', () => {
    const where = branchUserWhere(hrAllBranches, { status: 'ACTIVE' })
    expect(where).toEqual({ status: 'ACTIVE' })
    expect(where).not.toHaveProperty('branchId')
  })

  it('branchNestedUserWhere returns undefined (no nested filter at all)', () => {
    expect(branchNestedUserWhere(hrAllBranches)).toBeUndefined()
  })

  it('attendanceWhere / requestUserWhere pass extra through unchanged, with no `user` filter added', () => {
    expect(attendanceWhere(hrAllBranches, { date: new Date('2026-10-01') }))
      .toEqual({ date: new Date('2026-10-01') })
    expect(requestUserWhere(hrAllBranches, { status: 'PENDING' }))
      .toEqual({ status: 'PENDING' })
  })
})
