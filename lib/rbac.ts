import type { Role } from '@prisma/client'

// ── Permission types ────────────────────────────────────────────────────────

export type AppPermission =
  | 'approve_leave'
  | 'approve_warning'
  | 'approve_outside_work'
  | 'manage_attendance'
  | 'manage_leave_balance'
  | 'payroll_access'

export const ALL_PERMISSIONS: AppPermission[] = [
  'approve_leave',
  'approve_warning',
  'approve_outside_work',
  'manage_attendance',
  'manage_leave_balance',
  'payroll_access',
]

export const PERMISSION_LABELS: Record<AppPermission, string> = {
  approve_leave:        'อนุมัติการลา',
  approve_warning:      'ออกใบตักเตือน',
  approve_outside_work: 'อนุมัติงานนอกสถานที่',
  manage_attendance:    'จัดการการเข้างาน',
  manage_leave_balance: 'จัดการวันลาคงเหลือ',
  payroll_access:       'เข้าถึงข้อมูลเงินเดือน',
}

// ── Default role → permissions ──────────────────────────────────────────────
// These are the defaults seeded in the DB (RolePermission table).
// Individual override can be added via UserPermission in the future.

export const ROLE_PERMISSIONS: Record<Role, AppPermission[]> = {
  SUPER_ADMIN:  [...ALL_PERMISSIONS],
  MANAGER_HR:   [...ALL_PERMISSIONS],            // backward compat
  HR:           [...ALL_PERMISSIONS],
  MANAGER:      [
    'approve_leave',
    'approve_warning',
    'approve_outside_work',
    'manage_attendance',
  ],
  TEAM_LEADER:  ['approve_leave', 'approve_outside_work'],
  ADMIN:        ['approve_outside_work', 'manage_attendance', 'manage_leave_balance'],
  EMPLOYEE:     [],
  LAWYER:       [],
  ENFORCEMENT:  ['approve_warning'],
}

// ── Sync permission checks (role only, no DB) ───────────────────────────────

export function hasPermission(role: Role, permission: AppPermission): boolean {
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
export const canManageAttendance    = (role: Role) => hasPermission(role, 'manage_attendance')
export const canManageLeaveBalance  = (role: Role) => hasPermission(role, 'manage_leave_balance')
export const canAccessPayroll       = (role: Role) => hasPermission(role, 'payroll_access')

// Roles with at least one approval permission (used for approval dashboards)
export const canAccessApprovals = (role: Role) =>
  hasAnyPermission(role, ['approve_leave', 'approve_warning', 'approve_outside_work'])

// Roles that can manage other users (employees page, settings)
export const canManageUsers = (role: Role) =>
  role === 'SUPER_ADMIN' || role === 'MANAGER_HR' || role === 'HR' || role === 'ADMIN'

// Roles that can view all attendance (not just their own)
export const canViewAllAttendance = (role: Role) =>
  hasPermission(role, 'manage_attendance')

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
