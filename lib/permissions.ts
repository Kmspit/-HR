import type { Role } from '@prisma/client'

// ─────────────────────────────────────────────────────
// ROUTE PERMISSIONS — which roles can access each path
// ─────────────────────────────────────────────────────

export const ROUTE_PERMISSIONS: Record<string, Role[]> = {
  '/dashboard':         ['MANAGER_HR', 'ADMIN', 'EMPLOYEE', 'LAWYER'],
  '/attendance':        ['MANAGER_HR', 'ADMIN', 'EMPLOYEE', 'LAWYER'],
  '/leave':             ['MANAGER_HR', 'ADMIN', 'EMPLOYEE', 'LAWYER'],
  '/outside-work':      ['MANAGER_HR', 'ADMIN', 'EMPLOYEE', 'LAWYER'],
  '/weekly-plan':       ['MANAGER_HR', 'LAWYER'],
  '/calendar':          ['MANAGER_HR', 'ADMIN', 'EMPLOYEE', 'LAWYER'],
  '/payroll':           ['MANAGER_HR'],
  '/reports':           ['MANAGER_HR', 'ADMIN'],
  '/payslip':           ['MANAGER_HR', 'ADMIN', 'EMPLOYEE', 'LAWYER'],
  '/employees':         ['MANAGER_HR'],
  '/approvals':         ['MANAGER_HR', 'ADMIN'],
  '/announcements':     ['MANAGER_HR', 'ADMIN', 'EMPLOYEE', 'LAWYER'],
  '/warnings':          ['MANAGER_HR', 'ADMIN', 'EMPLOYEE', 'LAWYER'],
  '/rules':             ['MANAGER_HR', 'ADMIN', 'EMPLOYEE', 'LAWYER'],
  '/settings':          ['MANAGER_HR', 'ADMIN'],
  '/notifications':     ['MANAGER_HR', 'ADMIN', 'EMPLOYEE', 'LAWYER'],
}

// Default redirect after login per role
export const ROLE_DEFAULT_ROUTE: Record<Role, string> = {
  MANAGER_HR: '/dashboard',
  ADMIN:      '/dashboard',
  EMPLOYEE:   '/dashboard',
  LAWYER:     '/dashboard',
}

// Role display names (Thai)
export const ROLE_LABELS: Record<Role, string> = {
  MANAGER_HR: 'ผู้จัดการ / HR',
  ADMIN:      'Admin',
  EMPLOYEE:   'พนักงาน',
  LAWYER:     'ทนายความ',
}

export const ROLE_COLORS: Record<Role, string> = {
  MANAGER_HR: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  ADMIN:      'bg-blue-500/20 text-blue-400 border-blue-500/30',
  EMPLOYEE:   'bg-green-500/20 text-green-400 border-green-500/30',
  LAWYER:     'bg-amber-500/20 text-amber-400 border-amber-500/30',
}

export const ROLE_ICONS: Record<Role, string> = {
  MANAGER_HR: '👔',
  ADMIN:      '🔧',
  EMPLOYEE:   '👤',
  LAWYER:     '⚖️',
}

// ─────────────────────────────────────────────────────
// PERMISSION HELPERS
// ─────────────────────────────────────────────────────

export function canAccess(role: Role, path: string): boolean {
  const allowed = ROUTE_PERMISSIONS[path]
  if (!allowed) return true // unregistered paths are public
  return allowed.includes(role)
}

export function isManagerOrHR(role: Role): boolean {
  return role === 'MANAGER_HR'
}

export function isAdmin(role: Role): boolean {
  return role === 'ADMIN'
}

export function canApproveStep1(role: Role): boolean {
  return role === 'ADMIN' || role === 'MANAGER_HR'
}

export function canApproveStep2(role: Role): boolean {
  return role === 'MANAGER_HR'
}

export function canManageEmployees(role: Role): boolean {
  return role === 'MANAGER_HR'
}

export function canViewAllAttendance(role: Role): boolean {
  return role === 'MANAGER_HR' || role === 'ADMIN'
}

export function canViewPayroll(role: Role): boolean {
  return role === 'MANAGER_HR'
}
