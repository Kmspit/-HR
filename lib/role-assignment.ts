import type { Role } from '@prisma/client'

/** Higher rank may assign roles at or below their ceiling. */
const ROLE_ASSIGN_CEILING: Partial<Record<Role, Role[]>> = {
  SUPER_ADMIN: [
    'SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'MANAGER', 'TEAM_LEADER',
    'ADMIN', 'EMPLOYEE', 'LAWYER', 'ENFORCEMENT', 'CLIENT',
  ],
  CEO: [
    'MANAGER_HR', 'HR', 'MANAGER', 'TEAM_LEADER', 'ADMIN',
    'EMPLOYEE', 'LAWYER', 'ENFORCEMENT',
  ],
  MANAGER_HR: ['HR', 'MANAGER', 'TEAM_LEADER', 'ADMIN', 'EMPLOYEE', 'LAWYER', 'ENFORCEMENT'],
  HR: ['EMPLOYEE', 'LAWYER', 'ENFORCEMENT', 'TEAM_LEADER'],
}

const STATUS_CHANGE_ROLES: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR']

export function canAssignRole(actorRole: Role, targetRole: Role): boolean {
  const allowed = ROLE_ASSIGN_CEILING[actorRole]
  if (!allowed) return false
  return allowed.includes(targetRole)
}

export function canChangeUserStatus(actorRole: Role): boolean {
  return STATUS_CHANGE_ROLES.includes(actorRole)
}

export function canManageUserProfile(actorRole: Role): boolean {
  return ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER'].includes(actorRole)
}
