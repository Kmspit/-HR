import type { Role } from '@prisma/client'

/** Client-safe types + pure helpers — no server imports. */

export type ChainEntityType = 'LEAVE' | 'OUTSIDE_WORK' | 'WEEKLY_PLAN'

export type ApprovalStepRow = {
  id: string
  stepOrder: number
  stepName: string
  approverRole: Role | null
  approverId: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SKIPPED'
  actorId: string | null
  comment: string | null
  actedAt: Date | null
  actor?: { name: string } | null
}

export function isOrgSupervisorTemplateStep(step: {
  stepOrder: number
  approverRole: Role | null
  approverId: string | null
  canSkip: boolean
}): boolean {
  return step.stepOrder === 1 && step.canSkip && !step.approverRole && !step.approverId
}

export function canUserActOnStep(
  step: { approverId?: string | null; approverRole?: Role | null },
  userId: string,
  userRole: Role,
): boolean {
  if (step.approverId) return step.approverId === userId
  if (step.approverRole) return step.approverRole === userRole
  return false
}
