import type { Role } from '@prisma/client'

/** Client-safe types + pure helpers — no server imports. */

export type ChainEntityType = 'LEAVE' | 'OUTSIDE_WORK' | 'WEEKLY_PLAN' | 'FORGOT_SCAN'

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
  if (!step.approverRole) return false
  if (step.approverRole === userRole) return true
  // HR step — MANAGER_HR can act (role hierarchy)
  if (step.approverRole === 'HR' && userRole === 'MANAGER_HR') return true
  // CEO step — SUPER_ADMIN / CEO override
  if (step.approverRole === 'CEO' && (userRole === 'SUPER_ADMIN' || userRole === 'CEO')) return true
  return false
}

export const CHAIN_ENTITY_TYPES = ['LEAVE', 'OUTSIDE_WORK', 'WEEKLY_PLAN', 'FORGOT_SCAN'] as const

export function parseChainEntityType(raw: string | undefined | null): ChainEntityType | null {
  if (!raw) return null
  return (CHAIN_ENTITY_TYPES as readonly string[]).includes(raw) ? (raw as ChainEntityType) : null
}

export const CHAIN_ENTITY_LABELS: Record<ChainEntityType, string> = {
  LEAVE:        'การลา',
  OUTSIDE_WORK: 'ออกนอกสถานที่',
  WEEKLY_PLAN:  'แผนงานทนาย',
  FORGOT_SCAN:  'แก้ไขเวลา',
}
