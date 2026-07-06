import type { AppPermission } from '@/lib/access-control'

import { hasPermission, isForgotScanActor } from '@/lib/access-control'

import type { Role } from '@prisma/client'



export type ApprovalType = 'LEAVE' | 'OUTSIDE' | 'WEEKLY_PLAN' | 'FORGOT_SCAN'



const APPROVAL_PERMISSION: Record<ApprovalType, AppPermission | null> = {

  LEAVE: 'approve_leave',

  OUTSIDE: 'approve_outside_work',

  WEEKLY_PLAN: 'approve_weekly_plan',

  FORGOT_SCAN: null,

}



export function canPerformApproval(role: Role, type: ApprovalType): boolean {

  if (type === 'FORGOT_SCAN') return isForgotScanActor(role)

  const perm = APPROVAL_PERMISSION[type]

  return perm ? hasPermission(role, perm) : false

}

