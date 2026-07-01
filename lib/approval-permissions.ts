import type { AppPermission } from '@/lib/access-control'
import { hasPermission } from '@/lib/rbac'
import type { Role } from '@prisma/client'

export type ApprovalType = 'LEAVE' | 'OUTSIDE' | 'WEEKLY_PLAN' | 'FORGOT_SCAN'

const APPROVAL_PERMISSION: Record<ApprovalType, AppPermission> = {
  LEAVE: 'approve_leave',
  OUTSIDE: 'approve_outside_work',
  WEEKLY_PLAN: 'approve_weekly_plan',
  FORGOT_SCAN: 'manage_attendance',
}

export function canPerformApproval(role: Role, type: ApprovalType): boolean {
  const perm = APPROVAL_PERMISSION[type]
  return hasPermission(role, perm)
}
