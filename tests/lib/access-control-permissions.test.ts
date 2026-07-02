import { describe, it, expect } from 'vitest'
import {
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  type AppPermission,
} from '@/lib/access-control'
import type { Role } from '@prisma/client'

const ALL_ROLES: Role[] = [
  'SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER',
  'EMPLOYEE', 'LAWYER', 'ENFORCEMENT', 'CLIENT',
]

describe('ROLE_PERMISSIONS matrix', () => {
  it('every role has an explicit permission list', () => {
    for (const role of ALL_ROLES) {
      expect(Array.isArray(ROLE_PERMISSIONS[role])).toBe(true)
    }
  })

  it('only uses known AppPermission values', () => {
    for (const role of ALL_ROLES) {
      for (const perm of ROLE_PERMISSIONS[role]) {
        expect(ALL_PERMISSIONS).toContain(perm)
      }
    }
  })

  it('EMPLOYEE and CLIENT have no staff permissions', () => {
    expect(ROLE_PERMISSIONS.EMPLOYEE).toEqual([])
    expect(ROLE_PERMISSIONS.CLIENT).toEqual([])
  })

  it('MANAGER can approve leave but not manage payroll', () => {
    const perms = ROLE_PERMISSIONS.MANAGER
    expect(perms).toContain('approve_leave' satisfies AppPermission)
    expect(perms).not.toContain('manage_payroll')
  })

  it('ADMIN can approve payroll', () => {
    expect(ROLE_PERMISSIONS.ADMIN).toContain('approve_payroll' satisfies AppPermission)
  })
})
