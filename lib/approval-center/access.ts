import { hasPermission } from '@/lib/access-control'
import { canPerformApproval } from '@/lib/approval-permissions'
import { APPR_ROLES, HR_ADMIN, isForgotScanActor } from '@/lib/access-control'
import type { Role } from '@prisma/client'
import type { ApprovalType } from './types'

export function canAccessApprovalCenter(role: Role): boolean {
  if (!APPR_ROLES.includes(role)) return false
  return (
    hasPermission(role, 'approve_leave') ||
    hasPermission(role, 'approve_outside_work') ||
    hasPermission(role, 'approve_weekly_plan') ||
    hasPermission(role, 'manage_attendance') ||
    role === 'CEO' ||
    role === 'ADMIN' ||
    isForgotScanActor(role)
  )
}

export function canActOnDomain(role: Role, domain: ApprovalType): boolean {
  return canPerformApproval(role, domain)
}

export function canManageApprovalChains(role: Role): boolean {
  return HR_ADMIN.includes(role)
}
