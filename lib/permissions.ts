import type { Role } from '@prisma/client'
import {
  canAccessApprovals,
  canManageUsers,
  canAccessPayroll,
  canManageAttendance,
  hasPermission,
} from '@/lib/rbac'

// ─────────────────────────────────────────────────────
// ROUTE PERMISSIONS — which roles can access each path
// ─────────────────────────────────────────────────────

const ALL_ROLES: Role[] = ['SUPER_ADMIN', 'MANAGER_HR', 'HR', 'ADMIN', 'EMPLOYEE', 'LAWYER', 'MANAGER', 'TEAM_LEADER', 'ENFORCEMENT']
const HR_ROLES:  Role[] = ['SUPER_ADMIN', 'MANAGER_HR', 'HR']
const MGR_ROLES: Role[] = ['SUPER_ADMIN', 'MANAGER_HR', 'HR', 'MANAGER']
const APPR_ROLES: Role[] = ['SUPER_ADMIN', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']

// Roles that can view/approve weekly plans
const WEEKLY_PLAN_ROLES: Role[] = ['SUPER_ADMIN', 'MANAGER_HR', 'HR', 'LAWYER', 'MANAGER', 'TEAM_LEADER']

// Roles that can view attendance scan history (own team or all)
const SCAN_HISTORY_ROLES: Role[] = ['SUPER_ADMIN', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']

// Roles that can manage employees data
const EMPLOYEE_MGMT_ROLES: Role[] = ['SUPER_ADMIN', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER']

export const ROUTE_PERMISSIONS: Record<string, Role[]> = {
  '/dashboard':          ALL_ROLES,
  '/attendance':         ALL_ROLES,
  '/attendance/monthly': ALL_ROLES,
  '/attendance/scans':   SCAN_HISTORY_ROLES,
  '/leave':              ALL_ROLES,
  '/outside-work':       ALL_ROLES,
  '/weekly-plan':        WEEKLY_PLAN_ROLES,
  '/calendar':           ALL_ROLES,
  '/payroll':            HR_ROLES,
  '/reports':            [...MGR_ROLES, 'ADMIN'],
  '/payslip':            ALL_ROLES,
  '/employees':          EMPLOYEE_MGMT_ROLES,
  '/approvals':          APPR_ROLES,
  '/announcements':      ALL_ROLES,
  '/line-oa':            [...HR_ROLES, 'ADMIN'],
  '/warnings':           ALL_ROLES,
  '/rules':              ALL_ROLES,
  '/settings':           [...HR_ROLES, 'ADMIN'],
  '/notifications':      ALL_ROLES,
  '/profile':            ALL_ROLES,
  '/branches':           [...HR_ROLES, 'ADMIN'],
  '/organization':       [...HR_ROLES, 'ADMIN'],
  '/org-pending':        ALL_ROLES,
  '/probation':          [...HR_ROLES, 'MANAGER'],
  '/documents':          ALL_ROLES,
  '/unauthorized':       ALL_ROLES,
}

// Default redirect after login per role
export const ROLE_DEFAULT_ROUTE: Record<Role, string> = {
  SUPER_ADMIN:  '/dashboard',
  MANAGER_HR:   '/dashboard',
  HR:           '/dashboard',
  MANAGER:      '/dashboard',
  TEAM_LEADER:  '/dashboard',
  ADMIN:        '/dashboard',
  EMPLOYEE:     '/dashboard',
  LAWYER:       '/dashboard',
  ENFORCEMENT:  '/dashboard',
}

// Role display names (Thai)
export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN:  'Super Admin',
  MANAGER_HR:   'ผู้จัดการ / HR',
  HR:           'ฝ่ายบุคคล (HR)',
  MANAGER:      'ผู้จัดการ',
  TEAM_LEADER:  'หัวหน้าทีม',
  ADMIN:        'Admin',
  EMPLOYEE:     'พนักงาน',
  LAWYER:       'ทนายความ',
  ENFORCEMENT:  'เจ้าหน้าที่บังคับคดี',
}

export const ROLE_COLORS: Record<Role, string> = {
  SUPER_ADMIN:  'bg-red-500/20 text-red-400 border-red-500/30',
  MANAGER_HR:   'bg-purple-500/20 text-purple-400 border-purple-500/30',
  HR:           'bg-violet-500/20 text-violet-400 border-violet-500/30',
  MANAGER:      'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  TEAM_LEADER:  'bg-sky-500/20 text-sky-400 border-sky-500/30',
  ADMIN:        'bg-blue-500/20 text-blue-400 border-blue-500/30',
  EMPLOYEE:     'bg-green-500/20 text-green-400 border-green-500/30',
  LAWYER:       'bg-amber-500/20 text-amber-400 border-amber-500/30',
  ENFORCEMENT:  'bg-orange-500/20 text-orange-400 border-orange-500/30',
}

export const ROLE_ICONS: Record<Role, string> = {
  SUPER_ADMIN:  '🔑',
  MANAGER_HR:   '👔',
  HR:           '🏢',
  MANAGER:      '💼',
  TEAM_LEADER:  '👥',
  ADMIN:        '🔧',
  EMPLOYEE:     '👤',
  LAWYER:       '⚖️',
  ENFORCEMENT:  '🛡️',
}

// ─────────────────────────────────────────────────────
// PERMISSION HELPERS
// ─────────────────────────────────────────────────────

export function canAccess(role: Role, path: string): boolean {
  const allowed = ROUTE_PERMISSIONS[path]
  if (!allowed) return true
  return allowed.includes(role)
}

export function isManagerOrHR(role: Role): boolean {
  return role === 'MANAGER_HR' || role === 'HR' || role === 'SUPER_ADMIN'
}

export function isAdmin(role: Role): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN'
}

export function canApproveStep1(role: Role): boolean {
  return canAccessApprovals(role)
}

export function canApproveStep2(role: Role): boolean {
  return hasPermission(role, 'payroll_access') || role === 'MANAGER_HR' || role === 'SUPER_ADMIN' || role === 'HR'
}

export function canManageEmployees(role: Role): boolean {
  return canManageUsers(role)
}

export function canApproveAccounts(role: Role): boolean {
  return canManageUsers(role)
}

export { canViewAllAttendance, canManageAttendance as canEditAttendance } from '@/lib/rbac'

export function canViewPayroll(role: Role): boolean {
  return canAccessPayroll(role)
}

// Re-export for convenience
export { hasPermission, hasAnyPermission, getRolePermissions } from '@/lib/rbac'
export type { AppPermission } from '@/lib/rbac'
