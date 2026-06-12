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

const ALL_ROLES: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'EMPLOYEE', 'LAWYER', 'MANAGER', 'TEAM_LEADER', 'ENFORCEMENT']
const HR_ROLES:  Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR']
const MGR_ROLES: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'MANAGER']
const APPR_ROLES: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']
// Phase 5 — client portal
const CLIENT_ROLE: Role[] = ['CLIENT']
const CLIENT_MGMT_ROLES: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER']
// Phase 7 — case finance
const CAN_VIEW_FINANCE: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']

// Roles that can view/approve weekly plans
const WEEKLY_PLAN_ROLES: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'LAWYER', 'MANAGER', 'TEAM_LEADER']

// Roles that can view attendance scan history (own team or all)
const SCAN_HISTORY_ROLES: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']

// Roles that can manage employees data
const EMPLOYEE_MGMT_ROLES: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER']

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
  '/tasks':              ALL_ROLES,
  '/performance':        ALL_ROLES,
  '/case-documents':     ALL_ROLES,
  '/clients':            CLIENT_MGMT_ROLES,
  '/case-finance':            [...CAN_VIEW_FINANCE],
  '/expense-claim':           ALL_ROLES,
  '/ai-assistant':            ALL_ROLES,
  // Phase 8 — Debt Collection CRM
  '/debtors':                 ALL_ROLES,
  '/debt-followup':           ALL_ROLES,
  '/payment-appointments':    ALL_ROLES,
  // Phase 9 — Client CRM
  '/client-companies':        APPR_ROLES,
  '/contracts':               APPR_ROLES,
  '/client-history':          APPR_ROLES,
  // Phase 10 — Billing
  '/billing':                 [...HR_ROLES, 'ADMIN'],
  '/invoices':                [...HR_ROLES, 'ADMIN'],
  '/receipts':                [...HR_ROLES, 'ADMIN'],
  // Phase 11 — Approval 2.0
  '/approval-center':         [...APPR_ROLES],
  // Phase 12 — Knowledge Base
  '/knowledge':               ALL_ROLES,
  '/sop':                     ALL_ROLES,
  '/training':                ALL_ROLES,
  '/forgot-scan':             ALL_ROLES,
  '/client-portal':      CLIENT_ROLE,
  '/unauthorized':       [...ALL_ROLES, 'CLIENT'],
}

// Default redirect after login per role
export const ROLE_DEFAULT_ROUTE: Record<Role, string> = {
  SUPER_ADMIN:  '/dashboard',
  CEO:          '/dashboard',
  MANAGER_HR:   '/dashboard',
  HR:           '/dashboard',
  MANAGER:      '/dashboard',
  TEAM_LEADER:  '/dashboard',
  ADMIN:        '/dashboard',
  EMPLOYEE:     '/dashboard',
  LAWYER:       '/dashboard',
  ENFORCEMENT:  '/dashboard',
  CLIENT:       '/client-portal',
}

// Role display names (Thai)
export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN:  'Super Admin',
  CEO:          'ผู้บริหาร (CEO)',
  MANAGER_HR:   'ผู้จัดการ / HR',
  HR:           'ฝ่ายบุคคล (HR)',
  MANAGER:      'ผู้จัดการ',
  TEAM_LEADER:  'หัวหน้าทีม',
  ADMIN:        'Admin',
  EMPLOYEE:     'พนักงาน',
  LAWYER:       'ทนายความ',
  ENFORCEMENT:  'เจ้าหน้าที่บังคับคดี',
  CLIENT:       'ลูกค้า',
}

export const ROLE_COLORS: Record<Role, string> = {
  SUPER_ADMIN:  'bg-red-100    text-red-700    border-red-200    dark:bg-red-500/20    dark:text-red-400    dark:border-red-500/30',
  CEO:          'bg-amber-100  text-amber-700  border-amber-200  dark:bg-yellow-500/20 dark:text-yellow-400 dark:border-yellow-500/30',
  MANAGER_HR:   'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-500/20 dark:text-purple-400 dark:border-purple-500/30',
  HR:           'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-500/20 dark:text-violet-400 dark:border-violet-500/30',
  MANAGER:      'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-400 dark:border-indigo-500/30',
  TEAM_LEADER:  'bg-sky-100    text-sky-700    border-sky-200    dark:bg-sky-500/20    dark:text-sky-400    dark:border-sky-500/30',
  ADMIN:        'bg-blue-100   text-blue-700   border-blue-200   dark:bg-blue-500/20   dark:text-blue-400   dark:border-blue-500/30',
  EMPLOYEE:     'bg-green-100  text-green-700  border-green-200  dark:bg-green-500/20  dark:text-green-400  dark:border-green-500/30',
  LAWYER:       'bg-amber-100  text-amber-700  border-amber-200  dark:bg-amber-500/20  dark:text-amber-400  dark:border-amber-500/30',
  ENFORCEMENT:  'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-500/20 dark:text-orange-400 dark:border-orange-500/30',
  CLIENT:       'bg-teal-100   text-teal-700   border-teal-200   dark:bg-teal-500/20   dark:text-teal-400   dark:border-teal-500/30',
}

export const ROLE_ICONS: Record<Role, string> = {
  SUPER_ADMIN:  '🔑',
  CEO:          '👑',
  MANAGER_HR:   '👔',
  HR:           '🏢',
  MANAGER:      '💼',
  TEAM_LEADER:  '👥',
  ADMIN:        '🔧',
  EMPLOYEE:     '👤',
  LAWYER:       '⚖️',
  ENFORCEMENT:  '🛡️',
  CLIENT:       '🏛️',
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
  return role === 'MANAGER_HR' || role === 'HR' || role === 'SUPER_ADMIN' || role === 'CEO'
}

export function isAdmin(role: Role): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'CEO'
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
