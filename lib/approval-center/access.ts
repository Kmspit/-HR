import { hasPermission } from '@/lib/access-control'
import { canPerformApproval } from '@/lib/approval-permissions'
import { APPR_ROLES, HR_ADMIN } from '@/lib/module-gates'
import type { Role } from '@prisma/client'
import type { ApprovalType } from './types'

const FORGOT_SCAN_ACTOR_ROLES: Role[] = [
  'SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER',
]

export function canAccessApprovalCenter(role: Role): boolean {
  if (!APPR_ROLES.includes(role)) return false
  return (
    hasPermission(role, 'approve_leave') ||
    hasPermission(role, 'approve_outside_work') ||
    hasPermission(role, 'approve_weekly_plan') ||
    hasPermission(role, 'manage_attendance') ||
    role === 'CEO' ||
    role === 'ADMIN' ||
    FORGOT_SCAN_ACTOR_ROLES.includes(role)
  )
}

export function canActOnDomain(role: Role, domain: ApprovalType): boolean {
  return canPerformApproval(role, domain)
}

export function canManageApprovalChains(role: Role): boolean {
  return HR_ADMIN.includes(role)
}
