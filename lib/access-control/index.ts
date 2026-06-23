/**
 * lib/access-control/index.ts
 *
 * Single source of truth for all role/permission logic.
 * Merges lib/rbac.ts (RBAC core) and lib/permissions.ts (route + UI helpers).
 *
 * Both original files now re-export from here so existing imports keep working.
 */

import type { Role } from '@prisma/client'

// ── Permission types ──────────────────────────────────────────────────────────

export type AppPermission =
  | 'approve_leave'
  | 'approve_warning'
  | 'approve_outside_work'
  | 'approve_weekly_plan'
  | 'manage_attendance'
  | 'manage_leave_balance'
  | 'manage_payroll'
  | 'manage_employees'
  | 'view_team_only'
  | 'view_all_dashboard'
  | 'override_attendance'
  | 'payroll_access'        // legacy alias for manage_payroll

export const ALL_PERMISSIONS: AppPermission[] = [
  'approve_leave', 'approve_warning', 'approve_outside_work', 'approve_weekly_plan',
  'manage_attendance', 'manage_leave_balance', 'manage_payroll', 'manage_employees',
  'view_team_only', 'view_all_dashboard', 'override_attendance', 'payroll_access',
]

export const PERMISSION_LABELS: Record<AppPermission, string> = {
  approve_leave:        'อนุมัติการลา',
  approve_warning:      'ออกใบตักเตือน',
  approve_outside_work: 'อนุมัติงานนอกสถานที่',
  approve_weekly_plan:  'อนุมัติแผนงานรายสัปดาห์',
  manage_attendance:    'จัดการการเข้างาน',
  manage_leave_balance: 'จัดการวันลาคงเหลือ',
  manage_payroll:       'จัดการเงินเดือน',
  manage_employees:     'จัดการข้อมูลพนักงาน',
  view_team_only:       'ดูข้อมูลเฉพาะทีมตัวเอง',
  view_all_dashboard:   'ดู Dashboard ทั้งหมด',
  override_attendance:  'แก้ไขเวลาเข้า-ออกงาน',
  payroll_access:       'เข้าถึงข้อมูลเงินเดือน',
}

// ── Default role → permission matrix ─────────────────────────────────────────

export const ROLE_PERMISSIONS: Record<Role, AppPermission[]> = {
  SUPER_ADMIN: [...ALL_PERMISSIONS],
  CEO:         [...ALL_PERMISSIONS],
  MANAGER_HR:  [...ALL_PERMISSIONS],

  HR: [
    'approve_leave', 'approve_warning', 'approve_outside_work', 'approve_weekly_plan',
    'manage_attendance', 'manage_leave_balance', 'manage_payroll', 'manage_employees',
    'view_all_dashboard', 'override_attendance', 'payroll_access',
  ],

  MANAGER: [
    'approve_leave', 'approve_warning', 'approve_outside_work', 'approve_weekly_plan',
    'manage_attendance', 'view_all_dashboard',
  ],

  TEAM_LEADER: ['approve_leave', 'approve_outside_work', 'approve_weekly_plan', 'view_team_only'],

  ADMIN: ['approve_outside_work', 'manage_attendance', 'manage_leave_balance', 'manage_employees', 'override_attendance'],

  EMPLOYEE:    [],
  LAWYER:      [],
  ENFORCEMENT: ['approve_warning'],
  CLIENT:      [],
}

// ── Core permission helpers ───────────────────────────────────────────────────

export function hasPermission(role: Role, permission: AppPermission): boolean {
  if (permission === 'payroll_access') {
    return (ROLE_PERMISSIONS[role] ?? []).includes('payroll_access') ||
           (ROLE_PERMISSIONS[role] ?? []).includes('manage_payroll')
  }
  return (ROLE_PERMISSIONS[role] ?? []).includes(permission)
}

export function hasAnyPermission(role: Role, permissions: AppPermission[]): boolean {
  return permissions.some((p) => hasPermission(role, p))
}

export function getRolePermissions(role: Role): AppPermission[] {
  return ROLE_PERMISSIONS[role] ?? []
}

// ── Convenience wrappers ──────────────────────────────────────────────────────

export const canApproveLeave       = (role: Role) => hasPermission(role, 'approve_leave')
export const canApproveWarning     = (role: Role) => hasPermission(role, 'approve_warning')
export const canApproveOutsideWork = (role: Role) => hasPermission(role, 'approve_outside_work')
export const canApproveWeeklyPlan  = (role: Role) => hasPermission(role, 'approve_weekly_plan')
export const canManageAttendance   = (role: Role) => hasPermission(role, 'manage_attendance')
export const canManageLeaveBalance = (role: Role) => hasPermission(role, 'manage_leave_balance')
export const canAccessPayroll      = (role: Role) => hasPermission(role, 'payroll_access')
export const canManagePayroll      = (role: Role) => hasPermission(role, 'manage_payroll')
export const canManageEmployees    = (role: Role) => hasPermission(role, 'manage_employees')
export const canViewAllDashboard   = (role: Role) => hasPermission(role, 'view_all_dashboard')
export const canViewTeamOnly       = (role: Role) => hasPermission(role, 'view_team_only')
export const canOverrideAttendance = (role: Role) => hasPermission(role, 'override_attendance')

export const canAccessApprovals = (role: Role) =>
  hasAnyPermission(role, ['approve_leave', 'approve_warning', 'approve_outside_work', 'approve_weekly_plan'])

export const canManageUsers = (role: Role) =>
  role === 'SUPER_ADMIN' || role === 'CEO' || role === 'MANAGER_HR' || role === 'HR' || role === 'ADMIN' ||
  hasPermission(role, 'manage_employees')

export const canViewAllAttendance = (role: Role) =>
  hasPermission(role, 'manage_attendance') || hasPermission(role, 'view_all_dashboard')

// ── Employee type labels ──────────────────────────────────────────────────────

export const EMPLOYEE_TYPE_LABELS: Record<string, string> = {
  permanent_employee: 'พนักงานประจำ',
  probation_employee: 'พนักงานทดลองงาน',
  intern:             'นักศึกษาฝึกงาน',
}

export const EMPLOYEE_TYPES = [
  { value: 'permanent_employee', label: 'พนักงานประจำ' },
  { value: 'probation_employee', label: 'พนักงานทดลองงาน' },
  { value: 'intern',             label: 'นักศึกษาฝึกงาน' },
]

export function getDefaultRolePermissionSeed(): Array<{ role: Role; permission: AppPermission }> {
  const rows: Array<{ role: Role; permission: AppPermission }> = []
  for (const [role, perms] of Object.entries(ROLE_PERMISSIONS) as [Role, AppPermission[]][]) {
    for (const permission of perms) rows.push({ role, permission })
  }
  return rows
}

// ── Route permissions (from permissions.ts) ───────────────────────────────────

const ALL_ROLES: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'EMPLOYEE', 'LAWYER', 'MANAGER', 'TEAM_LEADER', 'ENFORCEMENT']
const HR_ROLES:  Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR']
const MGR_ROLES: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'MANAGER']
const APPR_ROLES: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']
const CLIENT_ROLE: Role[] = ['CLIENT']
const CLIENT_MGMT_ROLES: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER']
const CAN_VIEW_FINANCE: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']
const WEEKLY_PLAN_ROLES: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'LAWYER', 'MANAGER', 'TEAM_LEADER']
const SCAN_HISTORY_ROLES: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']
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
  '/debtors':                 ALL_ROLES,
  '/debt-followup':           ALL_ROLES,
  '/payment-appointments':    ALL_ROLES,
  '/client-companies':        APPR_ROLES,
  '/contracts':               APPR_ROLES,
  '/client-history':          APPR_ROLES,
  '/billing':                 [...HR_ROLES, 'ADMIN'],
  '/invoices':                [...HR_ROLES, 'ADMIN'],
  '/receipts':                [...HR_ROLES, 'ADMIN'],
  '/approval-center':         [...APPR_ROLES],
  '/knowledge':               ALL_ROLES,
  '/sop':                     ALL_ROLES,
  '/training':                ALL_ROLES,
  '/court-calendar':          ALL_ROLES,
  '/appointments':            ALL_ROLES,
  '/forgot-scan':             ALL_ROLES,
  '/security':                [...HR_ROLES, 'ADMIN'] as Role[],
  '/client-portal':      CLIENT_ROLE,
  '/unauthorized':       [...ALL_ROLES, 'CLIENT'],
}

export const ROLE_DEFAULT_ROUTE: Record<Role, string> = {
  SUPER_ADMIN: '/dashboard', CEO: '/dashboard', MANAGER_HR: '/dashboard', HR: '/dashboard',
  MANAGER: '/dashboard', TEAM_LEADER: '/dashboard', ADMIN: '/dashboard',
  EMPLOYEE: '/dashboard', LAWYER: '/dashboard', ENFORCEMENT: '/dashboard',
  CLIENT: '/client-portal',
}

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',    CEO: 'ผู้บริหาร (CEO)',
  MANAGER_HR: 'ผู้จัดการ / HR', HR: 'ฝ่ายบุคคล (HR)',
  MANAGER: 'ผู้จัดการ',         TEAM_LEADER: 'หัวหน้าทีม',
  ADMIN: 'Admin',                EMPLOYEE: 'พนักงาน',
  LAWYER: 'ทนายความ',           ENFORCEMENT: 'เจ้าหน้าที่บังคับคดี',
  CLIENT: 'ลูกค้า',
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
  SUPER_ADMIN: '🔑', CEO: '👑', MANAGER_HR: '👔', HR: '🏢',
  MANAGER: '💼', TEAM_LEADER: '👥', ADMIN: '🔧', EMPLOYEE: '👤',
  LAWYER: '⚖️', ENFORCEMENT: '🛡️', CLIENT: '🏛️',
}

// ── High-level helpers (formerly permissions.ts) ──────────────────────────────

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

export function canApproveStep1(role: Role): boolean { return canAccessApprovals(role) }

export function canApproveStep2(role: Role): boolean {
  return hasPermission(role, 'payroll_access') || role === 'MANAGER_HR' || role === 'SUPER_ADMIN' || role === 'HR'
}

export function canApproveAccounts(role: Role): boolean  { return canManageUsers(role) }
export function canViewPayroll(role: Role): boolean      { return canAccessPayroll(role) }

// Alias — permissions.ts re-exported canManageAttendance under this name
export const canEditAttendance = canManageAttendance
