/**
 * lib/access-control/index.ts — single source of truth for RBAC + route permissions.
 */

import type { Role } from '@prisma/client'
import {
  CORE_STAFF,
  EXEC_ONLY,
  HR_ADMIN,
  HR_CORE,
  APPR_ROLES,
  MGR_UP,
  EMPLOYEE_MGMT,
  WEEKLY_PLAN,
  SCAN_HISTORY,
  LEGAL_MODULE,
  CLIENT_MGMT,
  FINANCE_MODULE,
  WORK_MODULE,
} from '@/lib/module-gates'

// Re-export module gate role arrays (nav + middleware SSOT)
export {
  CORE_STAFF,
  EXEC_ONLY,
  HR_ADMIN,
  HR_CORE,
  APPR_ROLES,
  MGR_UP,
  EMPLOYEE_MGMT,
  WEEKLY_PLAN,
  SCAN_HISTORY,
  LEGAL_MODULE,
  CLIENT_MGMT,
  FINANCE_MODULE,
  WORK_MODULE,
} from '@/lib/module-gates'

/** Line managers / approvers with org scope */
export const SUPERVISOR_ROLES: Role[] = [
  'MANAGER', 'TEAM_LEADER', 'MANAGER_HR', 'ADMIN', 'SUPER_ADMIN', 'CEO',
]

/** Full HR admin (employees, payroll admin, documents) */
export const HR_ROLES: Role[] = HR_ADMIN

/** HR core staff — payroll + HR ops (no standalone ADMIN) */
export const HR_STAFF_ROLES: Role[] = HR_CORE

/** Company settings — view (Settings page) + edit (PATCH /api/settings) share this list.
 *  Keep these in sync: a role that can see the Settings form must also be able to save it. */
export const SETTINGS_EDIT_ROLES: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'ADMIN']

/** Announcement publish / edit gates */
export const ANNOUNCEMENT_EDITOR_ROLES: Role[] = ['MANAGER_HR', 'ADMIN', 'CEO']
export const ANNOUNCEMENT_UPLOADER_ROLES: Role[] = ['MANAGER_HR', 'ADMIN']

/** Forgot scan — inbox visibility + approval actors */
export const FORGOT_SCAN_SUPERVISOR_ROLES: Role[] = [
  'MANAGER', 'TEAM_LEADER', 'MANAGER_HR', 'ADMIN', 'SUPER_ADMIN', 'CEO',
]
export const FORGOT_SCAN_HR_ROLES: Role[] = ['HR', 'MANAGER_HR', 'ADMIN', 'SUPER_ADMIN', 'CEO']
export const FORGOT_SCAN_ACTOR_ROLES: Role[] = [
  'SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER',
]

/** Expense claim approvers */
export const EXPENSE_SUPERVISOR_ROLES: Role[] = [
  'SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'MANAGER', 'TEAM_LEADER', 'ADMIN',
]
export const EXPENSE_CEO_ROLES: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR']
export const EXPENSE_APPROVER_ROLES: Role[] = ['CEO', 'SUPER_ADMIN', 'MANAGER_HR', 'HR', 'ADMIN']

// ── Permission types ──────────────────────────────────────────────────────────

export type AppPermission =
  | 'approve_leave'
  | 'approve_warning'
  | 'approve_outside_work'
  | 'approve_weekly_plan'
  | 'manage_attendance'
  | 'manage_leave_balance'
  | 'manage_payroll'
  | 'approve_payroll'
  | 'manage_employees'
  | 'view_team_only'
  | 'view_all_dashboard'
  | 'override_attendance'
  | 'payroll_access'        // legacy alias for manage_payroll

export const ALL_PERMISSIONS: AppPermission[] = [
  'approve_leave', 'approve_warning', 'approve_outside_work', 'approve_weekly_plan',
  'manage_attendance', 'manage_leave_balance', 'manage_payroll', 'approve_payroll', 'manage_employees',
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
  approve_payroll:      'อนุมัติเงินเดือน',
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
    'manage_attendance', 'manage_leave_balance', 'manage_payroll', 'approve_payroll', 'manage_employees',
    'view_all_dashboard', 'override_attendance', 'payroll_access',
  ],

  MANAGER: [
    'approve_leave', 'approve_warning', 'approve_outside_work', 'approve_weekly_plan',
    'manage_attendance', 'view_all_dashboard',
  ],

  TEAM_LEADER: ['approve_leave', 'approve_outside_work', 'approve_weekly_plan', 'view_team_only'],

  ADMIN: ['approve_outside_work', 'manage_attendance', 'manage_leave_balance', 'manage_employees', 'override_attendance', 'approve_payroll'],

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

export function isHrRole(role: Role): boolean {
  return HR_ROLES.includes(role)
}

export function isSupervisorRole(role: Role): boolean {
  return SUPERVISOR_ROLES.includes(role)
}

export function isForgotScanActor(role: Role): boolean {
  return FORGOT_SCAN_ACTOR_ROLES.includes(role) || hasPermission(role, 'manage_attendance')
}

export function canSeeForgotScanInbox(role: Role): boolean {
  return FORGOT_SCAN_SUPERVISOR_ROLES.includes(role) || FORGOT_SCAN_HR_ROLES.includes(role)
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
export const canApprovePayroll     = (role: Role) =>
  hasPermission(role, 'approve_payroll') || hasPermission(role, 'manage_payroll')
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

// Permissions are static (ROLE_PERMISSIONS). No DB table — see docs/deploy-profiles.md RBAC note.

// ── Route permissions (Phase 1 — tightened module gates) ───────────────────────

const ALL_ROLES = CORE_STAFF
const CLIENT_ROLE: Role[] = ['CLIENT']
// Matches whoever holds the 'approve_outside_work' permission (same population
// that can already DELETE/PATCH a request) — kept in sync with ROLE_PERMISSIONS
// so the deleted-requests page/API stay consistent with each other.
const OUTSIDE_WORK_APPROVERS: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']

export const ROUTE_PERMISSIONS: Record<string, Role[]> = {
  '/dashboard':          ALL_ROLES,
  '/executive':          EXEC_ONLY,
  '/attendance':         ALL_ROLES,
  '/attendance/monthly': ALL_ROLES,
  '/attendance/scans':   SCAN_HISTORY,
  '/leave':              ALL_ROLES,
  '/outside-work':       ALL_ROLES,
  '/outside-work/deleted': OUTSIDE_WORK_APPROVERS,
  '/weekly-plan':        WEEKLY_PLAN,
  '/calendar':           ALL_ROLES,
  '/holidays':           HR_ADMIN,
  '/forgot-scan':        ALL_ROLES,
  '/payroll':            HR_CORE,
  '/reports':            [...MGR_UP],
  '/payslip':            ALL_ROLES,
  '/employees':          EMPLOYEE_MGMT,
  '/approval-center':    APPR_ROLES,
  '/announcements':      ALL_ROLES,
  '/line-oa':            HR_ADMIN,
  '/warnings':           ALL_ROLES,
  '/rules':              ALL_ROLES,
  '/settings':           HR_ADMIN,
  '/notifications':      ALL_ROLES,
  '/profile':            ALL_ROLES,
  '/branches':           HR_ADMIN,
  '/organization':       HR_ADMIN,
  '/org-pending':        ALL_ROLES,
  '/probation':          [...HR_CORE, 'MANAGER'],
  '/documents':          ALL_ROLES,
  '/tasks':              WORK_MODULE,
  '/performance':        WORK_MODULE,
  '/knowledge':          WORK_MODULE,
  '/sop':                WORK_MODULE,
  '/training':           WORK_MODULE,
  '/cases':              LEGAL_MODULE,
  '/case-documents':     LEGAL_MODULE,
  '/clients':            CLIENT_MGMT,
  '/debtors':            LEGAL_MODULE,
  '/debt-followup':      LEGAL_MODULE,
  '/payment-appointments': LEGAL_MODULE,
  '/court-calendar':     LEGAL_MODULE,
  '/appointments':       LEGAL_MODULE,
  '/recovery':           LEGAL_MODULE,
  '/case-finance':       [...FINANCE_MODULE, 'MANAGER', 'LAWYER'],
  '/expense-claim':      [...FINANCE_MODULE, 'MANAGER', 'LAWYER'],
  '/client-companies':   CLIENT_MGMT,
  '/contracts':          CLIENT_MGMT,
  '/client-history':     CLIENT_MGMT,
  '/billing':            FINANCE_MODULE,
  '/invoices':           FINANCE_MODULE,
  '/receipts':           FINANCE_MODULE,
  '/automation':         HR_ADMIN,
  '/security':           [...EXEC_ONLY, 'MANAGER_HR', 'HR'],
  '/manual':             ALL_ROLES,
  '/system-logs':        HR_ADMIN,
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
  MANAGER_HR: 'ผู้จัดการ HR', HR: 'ฝ่ายบุคคล (HR)',
  MANAGER: 'ผู้จัดการ',         TEAM_LEADER: 'หัวหน้าทีม',
  ADMIN: 'Admin ระบบ',           EMPLOYEE: 'พนักงาน',
  LAWYER: 'ทนายความ',           ENFORCEMENT: 'เจ้าหน้าที่บังคับคดี',
  CLIENT: 'ลูกค้า',
}

/** Short tooltip for settings/employees — clarifies HR vs ADMIN vs MANAGER_HR */
export const ROLE_DESCRIPTIONS: Partial<Record<Role, string>> = {
  SUPER_ADMIN: 'สิทธิ์สูงสุด — ตั้งค่าระบบและอนุมัติได้ทุกโมดูล',
  CEO: 'ผู้บริหาร — ดูภาพรวมและอนุมัติระดับสูง',
  MANAGER_HR: 'หัวหน้า HR — จัดการพนักงาน เงินเดือน ลา และตั้งค่า HR ครบ',
  HR: 'ฝ่ายบุคคล — ดูแลพนักงาน เงินเดือน ลา (ไม่ใช่ Admin ระบบ)',
  ADMIN: 'Admin ระบบ — ตั้งค่าเทคนิค/สาขา ไม่ใช่หน้าที่ HR โดยตรง',
  MANAGER: 'หัวหน้างาน — อนุมัติลา/งานนอกสถานที่ของทีม',
  TEAM_LEADER: 'หัวหน้าทีม — อนุมัติคำขอของสมาชิกในทีม',
}

export const ROLE_COLORS: Record<Role, string> = {
  SUPER_ADMIN:  'bg-red-100    text-red-700    border-red-200    dark:bg-red-500/20    dark:text-red-400    dark:border-red-500/30',
  CEO:          'bg-amber-100  text-amber-700  border-amber-200  dark:bg-yellow-500/20 dark:text-yellow-400 dark:border-yellow-500/30',
  MANAGER_HR:   'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-500/20 dark:text-purple-400 dark:border-purple-500/30',
  HR:           'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-500/20 dark:text-violet-400 dark:border-violet-500/30',
  MANAGER:      'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-400 dark:border-indigo-500/30',
  TEAM_LEADER:  'bg-sky-100    text-sky-700    border-sky-200    dark:bg-sky-500/20    dark:text-sky-400    dark:border-sky-500/30',
  ADMIN:        'bg-green-100   text-green-700   border-green-200   dark:bg-green-500/20   dark:text-green-400   dark:border-green-500/30',
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
  // Longest-prefix match — same logic as middleware (lib/route-match.ts)
  const sorted = Object.keys(ROUTE_PERMISSIONS).sort((a, b) => b.length - a.length)
  const matched = sorted.find((p) => path === p || path.startsWith(`${p}/`))
  if (!matched) return false
  return ROUTE_PERMISSIONS[matched].includes(role)
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
