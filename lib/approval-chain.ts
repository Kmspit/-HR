import type { PrismaClient, Role } from '@prisma/client'
import { createNotification } from '@/lib/notifications'

// ── Types ───────────────────────────────────────────────────────────────────

export type ChainStepRow = {
  id: string
  stepOrder: number
  stepName: string
  approverRole: Role | null
  approverId: string | null
  canSkip: boolean
}

export type LeaveStepRow = {
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

// ── Apply chain to a newly created leave request ────────────────────────────

export async function applyChainToLeave(
  prisma: PrismaClient,
  leaveId: string,
  chainId: string,
): Promise<void> {
  const chain = await prisma.approvalChainConfig.findUnique({
    where: { id: chainId },
    include: { steps: { orderBy: { stepOrder: 'asc' } } },
  })
  if (!chain || !chain.isActive) return

  // Create a LeaveApprovalStep record for every step in the chain
  await prisma.leaveApprovalStep.createMany({
    data: chain.steps.map((s) => ({
      leaveRequestId: leaveId,
      chainStepId:    s.id,
      stepOrder:      s.stepOrder,
      stepName:       s.stepName,
      approverRole:   s.approverRole,
      approverId:     s.approverId,
      status:         'PENDING',
    })),
  })

  // Activate the first step + attach chain to leave
  const firstOrder = chain.steps[0]?.stepOrder ?? 1
  await prisma.leaveRequest.update({
    where: { id: leaveId },
    data: { chainConfigId: chainId, currentStepOrder: firstOrder },
  })
}

// ── Resolve the active default chain (if any) ───────────────────────────────

export async function getDefaultChain(prisma: PrismaClient) {
  return prisma.approvalChainConfig.findFirst({
    where: { isDefault: true, isActive: true },
    include: { steps: { orderBy: { stepOrder: 'asc' } } },
  })
}

// ── Determine if a user can act on the current pending step ─────────────────

export function canUserActOnStep(
  step: ChainStepRow,
  userId: string,
  userRole: Role,
): boolean {
  // Specific user override takes precedence
  if (step.approverId) return step.approverId === userId
  // Role check
  if (step.approverRole) return step.approverRole === userRole
  // No restriction set → any authenticated user can act
  return true
}

// ── Get the steps for a leave request, including actor details ───────────────

export async function getLeaveSteps(
  prisma: PrismaClient,
  leaveId: string,
): Promise<LeaveStepRow[]> {
  const steps = await prisma.leaveApprovalStep.findMany({
    where: { leaveRequestId: leaveId },
    orderBy: { stepOrder: 'asc' },
    include: { actor: { select: { name: true } } },
  })
  return steps.map((s) => ({
    id:          s.id,
    stepOrder:   s.stepOrder,
    stepName:    s.stepName,
    approverRole: s.approverRole,
    approverId:  s.approverId,
    status:      s.status as LeaveStepRow['status'],
    actorId:     s.actorId,
    comment:     s.comment,
    actedAt:     s.actedAt,
    actor:       s.actor,
  }))
}

// ── Advance chain after a step is approved ──────────────────────────────────

export async function advanceLeaveChain(
  prisma: PrismaClient,
  leaveId: string,
): Promise<{ finalized: boolean; nextStepOrder: number | null }> {
  const leave = await prisma.leaveRequest.findUnique({
    where: { id: leaveId },
    select: { currentStepOrder: true, chainConfigId: true, userId: true },
  })
  if (!leave?.chainConfigId) return { finalized: false, nextStepOrder: null }

  // Find next PENDING step
  const nextStep = await prisma.leaveApprovalStep.findFirst({
    where: {
      leaveRequestId: leaveId,
      status: 'PENDING',
      stepOrder: { gt: leave.currentStepOrder },
    },
    orderBy: { stepOrder: 'asc' },
  })

  if (nextStep) {
    await prisma.leaveRequest.update({
      where: { id: leaveId },
      data: { currentStepOrder: nextStep.stepOrder },
    })
    // Notify next approver (by role)
    if (nextStep.approverRole) {
      await notifyNextApprovers(prisma, leaveId, nextStep.approverRole, nextStep.stepName)
    }
    return { finalized: false, nextStepOrder: nextStep.stepOrder }
  }

  // All steps done → finalize
  await prisma.leaveRequest.update({
    where: { id: leaveId },
    data: { status: 'APPROVED', currentStepOrder: 0 },
  })

  await createNotification({
    userId: leave.userId,
    type: 'LEAVE_APPROVED',
    title: '✅ คำขอลาได้รับการอนุมัติแล้ว',
    message: 'คำขอลาของคุณผ่านขั้นตอนการอนุมัติทั้งหมดแล้ว',
    link: '/leave',
  })

  return { finalized: true, nextStepOrder: null }
}

// ── Reject leave chain — mark all remaining steps as skipped ────────────────

export async function rejectLeaveChain(
  prisma: PrismaClient,
  leaveId: string,
  currentStepId: string,
  actorId: string,
  comment: string,
  ip: string,
): Promise<void> {
  // Mark all subsequent PENDING steps as SKIPPED
  const leave = await prisma.leaveRequest.findUnique({
    where: { id: leaveId },
    select: { currentStepOrder: true, userId: true },
  })

  await prisma.leaveApprovalStep.updateMany({
    where: {
      leaveRequestId: leaveId,
      status: 'PENDING',
      id: { not: currentStepId },
    },
    data: { status: 'SKIPPED' },
  })

  await prisma.leaveRequest.update({
    where: { id: leaveId },
    data: { status: 'REJECTED', currentStepOrder: 0 },
  })

  if (leave?.userId) {
    await createNotification({
      userId: leave.userId,
      type: 'LEAVE_REJECTED',
      title: '❌ คำขอลาถูกปฏิเสธ',
      message: comment || 'คำขอลาถูกปฏิเสธโดยผู้อนุมัติ',
      link: '/leave',
    })
  }
}

// ── Notify users of a given role that the chain has advanced ────────────────

async function notifyNextApprovers(
  prisma: PrismaClient,
  leaveId: string,
  approverRole: Role,
  stepName: string,
): Promise<void> {
  const approvers = await prisma.user.findMany({
    where: { role: approverRole, status: 'ACTIVE' },
    select: { id: true },
  })
  if (approvers.length === 0) return
  await prisma.notification.createMany({
    data: approvers.map((u) => ({
      userId: u.id,
      type: 'LEAVE_REQUEST' as const,
      title: `📋 รอการอนุมัติ: ${stepName}`,
      message: `คำขอลา ID ${leaveId} รอการอนุมัติในขั้น "${stepName}"`,
      link: '/approvals',
    })),
  })
}
