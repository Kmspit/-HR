import type { AppPermission } from '@/lib/access-control'
import { hasPermission } from '@/lib/rbac'
import type { Role } from '@prisma/client'

export type ApprovalType = 'LEAVE' | 'OUTSIDE' | 'WEEKLY_PLAN' | 'FORGOT_SCAN'

const FORGOT_SCAN_ACTOR_ROLES: Role[] = [
  'SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER',
]

const APPROVAL_PERMISSION: Record<ApprovalType, AppPermission | null> = {
  LEAVE: 'approve_leave',
  OUTSIDE: 'approve_outside_work',
  WEEKLY_PLAN: 'approve_weekly_plan',
  FORGOT_SCAN: null,
}

export function canPerformApproval(role: Role, type: ApprovalType): boolean {
  if (type === 'FORGOT_SCAN') {
    return (
      FORGOT_SCAN_ACTOR_ROLES.includes(role) ||
      hasPermission(role, 'manage_attendance')
    )
  }
  const perm = APPROVAL_PERMISSION[type]
  return perm ? hasPermission(role, perm) : false
}
