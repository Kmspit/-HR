import type { Role } from '@prisma/client'

// ── Permission types ────────────────────────────────────────────────────────

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
  'approve_leave',
  'approve_warning',
  'approve_outside_work',
  'approve_weekly_plan',
  'manage_attendance',
  'manage_leave_balance',
  'manage_payroll',
  'manage_employees',
  'view_team_only',
  'view_all_dashboard',
  'override_attendance',
  'payroll_access',
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

// ── Default role → permissions ──────────────────────────────────────────────
// These are the defaults. Individual overrides can be added via RolePermission table.

export const ROLE_PERMISSIONS: Record<Role, AppPermission[]> = {
  SUPER_ADMIN: [...ALL_PERMISSIONS],

  MANAGER_HR: [...ALL_PERMISSIONS],   // backward compat — HR Manager has all

  HR: [
    'approve_leave',
    'approve_warning',
    'approve_outside_work',
    'approve_weekly_plan',
    'manage_attendance',
    'manage_leave_balance',
    'manage_payroll',
    'manage_employees',
    'view_all_dashboard',
    'override_attendance',
    'payroll_access',
  ],

  MANAGER: [
    'approve_leave',
    'approve_warning',
    'approve_outside_work',
    'approve_weekly_plan',
    'manage_attendance',
    'view_all_dashboard',
  ],

  TEAM_LEADER: [
    'approve_leave',
    'approve_outside_work',
    'approve_weekly_plan',
    'view_team_only',
  ],

  ADMIN: [
    'approve_outside_work',
    'manage_attendance',
    'manage_leave_balance',
    'manage_employees',
    'override_attendance',
  ],

  EMPLOYEE:    [],

  LAWYER:      [],

  ENFORCEMENT: ['approve_warning'],
}

// ── Sync permission checks (role only, no DB) ───────────────────────────────

export function hasPermission(role: Role, permission: AppPermission): boolean {
  // payroll_access and manage_payroll are aliases
  if (permission === 'payroll_access') {
    return (
      (ROLE_PERMISSIONS[role] ?? []).includes('payroll_access') ||
      (ROLE_PERMISSIONS[role] ?? []).includes('manage_payroll')
    )
  }
  return (ROLE_PERMISSIONS[role] ?? []).includes(permission)
}

export function hasAnyPermission(role: Role, permissions: AppPermission[]): boolean {
  return permissions.some((p) => hasPermission(role, p))
}

export function getRolePermissions(role: Role): AppPermission[] {
  return ROLE_PERMISSIONS[role] ?? []
}

// ── Convenience wrappers ────────────────────────────────────────────────────

export const canApproveLeave        = (role: Role) => hasPermission(role, 'approve_leave')
export const canApproveWarning      = (role: Role) => hasPermission(role, 'approve_warning')
export const canApproveOutsideWork  = (role: Role) => hasPermission(role, 'approve_outside_work')
export const canApproveWeeklyPlan   = (role: Role) => hasPermission(role, 'approve_weekly_plan')
export const canManageAttendance    = (role: Role) => hasPermission(role, 'manage_attendance')
export const canManageLeaveBalance  = (role: Role) => hasPermission(role, 'manage_leave_balance')
export const canAccessPayroll       = (role: Role) => hasPermission(role, 'payroll_access')
export const canManagePayroll       = (role: Role) => hasPermission(role, 'manage_payroll')
export const canManageEmployees     = (role: Role) => hasPermission(role, 'manage_employees')
export const canViewAllDashboard    = (role: Role) => hasPermission(role, 'view_all_dashboard')
export const canViewTeamOnly        = (role: Role) => hasPermission(role, 'view_team_only')
export const canOverrideAttendance  = (role: Role) => hasPermission(role, 'override_attendance')

// Roles with at least one approval permission (used for approval dashboards)
export const canAccessApprovals = (role: Role) =>
  hasAnyPermission(role, ['approve_leave', 'approve_warning', 'approve_outside_work', 'approve_weekly_plan'])

// Roles that can manage other users (employees page, settings)
export const canManageUsers = (role: Role) =>
  role === 'SUPER_ADMIN' || role === 'MANAGER_HR' || role === 'HR' || role === 'ADMIN' ||
  hasPermission(role, 'manage_employees')

// Roles that can view all attendance (not just their own)
export const canViewAllAttendance = (role: Role) =>
  hasPermission(role, 'manage_attendance') || hasPermission(role, 'view_all_dashboard')

// ── Employee type labels ────────────────────────────────────────────────────

export const EMPLOYEE_TYPE_LABELS: Record<string, string> = {
  permanent_employee:  'พนักงานประจำ',
  probation_employee:  'พนักงานทดลองงาน',
  intern:              'นักศึกษาฝึกงาน',
}

export const EMPLOYEE_TYPES = [
  { value: 'permanent_employee',  label: 'พนักงานประจำ' },
  { value: 'probation_employee',  label: 'พนักงานทดลองงาน' },
  { value: 'intern',              label: 'นักศึกษาฝึกงาน' },
]

// ── DB seed helper — called once to populate RolePermission table ───────────

export function getDefaultRolePermissionSeed(): Array<{ role: Role; permission: AppPermission }> {
  const rows: Array<{ role: Role; permission: AppPermission }> = []
  for (const [role, perms] of Object.entries(ROLE_PERMISSIONS) as [Role, AppPermission[]][]) {
    for (const permission of perms) {
      rows.push({ role, permission })
    }
  }
  return rows
}
