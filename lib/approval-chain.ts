import type { ApprovalStepStatus, PrismaClient, Role } from '@prisma/client'
import { createNotification } from '@/lib/notifications'
import { canApproverActOnRequester } from '@/lib/org-scope'
import {
  canUserActOnStep,
  isOrgSupervisorTemplateStep,
  type ApprovalStepRow,
  type ChainEntityType,
} from '@/lib/approval-chain-shared'

export {
  canUserActOnStep,
  isOrgSupervisorTemplateStep,
  type ApprovalStepRow,
  type ChainEntityType,
} from '@/lib/approval-chain-shared'

// ── Types ───────────────────────────────────────────────────────────────────

export type ChainStepRow = {
  id: string
  stepOrder: number
  stepName: string
  approverRole: Role | null
  approverId: string | null
  canSkip: boolean
}

// ── Org supervisor resolution (Outside Work step 1) ───────────────────────────

export async function resolveOrgSupervisorId(
  prisma: PrismaClient,
  requesterId: string,
): Promise<string | null> {
  const requester = await prisma.user.findUnique({
    where: { id: requesterId },
    select: { teamLeaderId: true, managerId: true },
  })
  if (!requester) return null
  return requester.teamLeaderId ?? requester.managerId ?? null
}

/** @deprecated use ApprovalStepRow */
export type LeaveStepRow = ApprovalStepRow

type TemplateStep = {
  id: string
  stepOrder: number
  stepName: string
  approverRole: Role | null
  approverId: string | null
  canSkip: boolean
}

// ── Apply chain to leave ────────────────────────────────────────────────────

export async function applyChainToLeave(
  prisma: PrismaClient,
  leaveId: string,
  chainId: string,
  requesterId: string,
): Promise<void> {
  const requester = await prisma.user.findUnique({
    where: { id: requesterId },
    select: { role: true },
  })

  if (requester?.role === 'CEO' || requester?.role === 'SUPER_ADMIN') {
    await prisma.leaveRequest.update({
      where: { id: leaveId },
      data: {
        chainConfigId:  chainId,
        currentStepOrder: 0,
        status:         'APPROVED',
      },
    })
    await createNotification({
      userId: requesterId,
      type: 'LEAVE_APPROVED',
      title: '✅ คำขอลาได้รับการอนุมัติแล้ว',
      message: 'คำขอลาของคุณได้รับการอนุมัติอัตโนมัติ',
      link: '/leave',
    })
    return
  }

  const chain = await prisma.approvalChainConfig.findUnique({
    where: { id: chainId },
    include: { steps: { orderBy: { stepOrder: 'asc' } } },
  })
  if (!chain || !chain.isActive) return

  const supervisorId = await resolveOrgSupervisorId(prisma, requesterId)

  const instanceSteps = chain.steps.map((s) => {
    let approverId = s.approverId
    let approverRole = s.approverRole
    let status: ApprovalStepStatus = 'PENDING'

    if (isOrgSupervisorTemplateStep(s)) {
      approverId = supervisorId
      approverRole = null
      if (!approverId) {
        status = 'SKIPPED'
      }
    }

    return {
      leaveRequestId: leaveId,
      chainStepId:    s.id,
      stepOrder:      s.stepOrder,
      stepName:       s.stepName,
      approverRole,
      approverId,
      status,
    }
  })

  await prisma.leaveApprovalStep.createMany({ data: instanceSteps })

  const firstPending = instanceSteps
    .filter((s) => s.status === 'PENDING')
    .sort((a, b) => a.stepOrder - b.stepOrder)[0]

  if (!firstPending) {
    await prisma.leaveRequest.update({
      where: { id: leaveId },
      data: {
        chainConfigId:  chainId,
        currentStepOrder: 0,
        status:         'APPROVED',
      },
    })
    await createNotification({
      userId: requesterId,
      type: 'LEAVE_APPROVED',
      title: '✅ คำขอลาได้รับการอนุมัติแล้ว',
      message: 'คำขอลาของคุณผ่านขั้นตอนการอนุมัติทั้งหมดแล้ว',
      link: '/leave',
    })
    return
  }

  await prisma.leaveRequest.update({
    where: { id: leaveId },
    data: {
      chainConfigId:  chainId,
      currentStepOrder: firstPending.stepOrder,
    },
  })

  await notifyLeaveStepApprovers(
    prisma,
    leaveId,
    firstPending.stepName,
    firstPending.approverId,
    firstPending.approverRole,
  )
}

// ── Apply chain to outside work ─────────────────────────────────────────────

export async function applyChainToOutsideWork(
  prisma: PrismaClient,
  requestId: string,
  chainId: string,
  requesterId: string,
): Promise<void> {
  const requester = await prisma.user.findUnique({
    where: { id: requesterId },
    select: { role: true },
  })

  // CEO / SUPER_ADMIN self-request → auto-approve
  if (requester?.role === 'CEO' || requester?.role === 'SUPER_ADMIN') {
    await prisma.outsideWorkRequest.update({
      where: { id: requestId },
      data: {
        chainConfigId:  chainId,
        currentStepOrder: 0,
        status:         'APPROVED',
        approvalStatus: 'approved',
      },
    })
    return
  }

  const chain = await prisma.approvalChainConfig.findUnique({
    where: { id: chainId },
    include: { steps: { orderBy: { stepOrder: 'asc' } } },
  })
  if (!chain || !chain.isActive) return

  const supervisorId = await resolveOrgSupervisorId(prisma, requesterId)

  const instanceSteps = chain.steps.map((s) => {
    let approverId = s.approverId
    let approverRole = s.approverRole
    let status: ApprovalStepStatus = 'PENDING'

    if (isOrgSupervisorTemplateStep(s)) {
      approverId = supervisorId
      approverRole = null
      if (!approverId) {
        status = 'SKIPPED'
      }
    }

    return {
      requestId,
      chainStepId:  s.id,
      stepOrder:    s.stepOrder,
      stepName:     s.stepName,
      approverRole,
      approverId,
      status,
    }
  })

  await prisma.outsideWorkApprovalStep.createMany({ data: instanceSteps })

  const firstPending = instanceSteps
    .filter((s) => s.status === 'PENDING')
    .sort((a, b) => a.stepOrder - b.stepOrder)[0]

  if (!firstPending) {
    await prisma.outsideWorkRequest.update({
      where: { id: requestId },
      data: {
        chainConfigId:  chainId,
        currentStepOrder: 0,
        status:         'APPROVED',
        approvalStatus: 'approved',
      },
    })
    await createNotification({
      userId: requesterId,
      type: 'OUTSIDE_APPROVED',
      title: '✅ คำขอออกนอกสถานที่ได้รับการอนุมัติแล้ว',
      message: 'คำขอของคุณผ่านขั้นตอนการอนุมัติทั้งหมดแล้ว',
      link: '/outside-work',
    })
    return
  }

  await prisma.outsideWorkRequest.update({
    where: { id: requestId },
    data: {
      chainConfigId:  chainId,
      currentStepOrder: firstPending.stepOrder,
      status:         'PENDING',
      approvalStatus: 'pending_chain',
    },
  })

  await notifyOutsideStepApprovers(prisma, requestId, firstPending.stepName, firstPending.approverId, firstPending.approverRole)
}

// ── Default chain lookup ────────────────────────────────────────────────────

export async function getDefaultChain(
  prisma: PrismaClient,
  entityType: ChainEntityType = 'LEAVE',
) {
  return prisma.approvalChainConfig.findFirst({
    where: { isDefault: true, isActive: true, entityType },
    include: { steps: { orderBy: { stepOrder: 'asc' } } },
  })
}

// ── Step queries ────────────────────────────────────────────────────────────

export async function getLeaveSteps(
  prisma: PrismaClient,
  leaveId: string,
): Promise<ApprovalStepRow[]> {
  const steps = await prisma.leaveApprovalStep.findMany({
    where: { leaveRequestId: leaveId },
    orderBy: { stepOrder: 'asc' },
    include: { actor: { select: { name: true } } },
  })
  return steps.map(mapStepRow)
}

export async function getOutsideWorkSteps(
  prisma: PrismaClient,
  requestId: string,
): Promise<ApprovalStepRow[]> {
  const steps = await prisma.outsideWorkApprovalStep.findMany({
    where: { requestId },
    orderBy: { stepOrder: 'asc' },
    include: { actor: { select: { name: true } } },
  })
  return steps.map(mapStepRow)
}

function mapStepRow(s: {
  id: string
  stepOrder: number
  stepName: string
  approverRole: Role | null
  approverId: string | null
  status: ApprovalStepStatus
  actorId: string | null
  comment: string | null
  actedAt: Date | null
  actor?: { name: string } | null
}): ApprovalStepRow {
  return {
    id:           s.id,
    stepOrder:    s.stepOrder,
    stepName:     s.stepName,
    approverRole: s.approverRole,
    approverId:   s.approverId,
    status:       s.status as ApprovalStepRow['status'],
    actorId:      s.actorId,
    comment:      s.comment,
    actedAt:      s.actedAt,
    actor:        s.actor,
  }
}

// ── Advance / reject — leave ────────────────────────────────────────────────

export async function advanceLeaveChain(
  prisma: PrismaClient,
  leaveId: string,
): Promise<{ finalized: boolean; nextStepOrder: number | null }> {
  const leave = await prisma.leaveRequest.findUnique({
    where: { id: leaveId },
    select: { currentStepOrder: true, chainConfigId: true, userId: true },
  })
  if (!leave?.chainConfigId) return { finalized: false, nextStepOrder: null }

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
    if (nextStep.approverRole) {
      await notifyLeaveStepApprovers(prisma, leaveId, nextStep.stepName, null, nextStep.approverRole)
    } else if (nextStep.approverId) {
      await notifyLeaveStepApprovers(prisma, leaveId, nextStep.stepName, nextStep.approverId, null)
    }
    return { finalized: false, nextStepOrder: nextStep.stepOrder }
  }

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

export async function rejectLeaveChain(
  prisma: PrismaClient,
  leaveId: string,
  currentStepId: string,
  _actorId: string,
  comment: string,
  _ip: string,
): Promise<void> {
  const leave = await prisma.leaveRequest.findUnique({
    where: { id: leaveId },
    select: { userId: true },
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

// ── Advance / reject — outside work ─────────────────────────────────────────

export async function advanceOutsideWorkChain(
  prisma: PrismaClient,
  requestId: string,
): Promise<{ finalized: boolean; nextStepOrder: number | null }> {
  const request = await prisma.outsideWorkRequest.findUnique({
    where: { id: requestId },
    select: { currentStepOrder: true, chainConfigId: true, userId: true },
  })
  if (!request?.chainConfigId) return { finalized: false, nextStepOrder: null }

  const nextStep = await prisma.outsideWorkApprovalStep.findFirst({
    where: {
      requestId,
      status: 'PENDING',
      stepOrder: { gt: request.currentStepOrder },
    },
    orderBy: { stepOrder: 'asc' },
  })

  if (nextStep) {
    await prisma.outsideWorkRequest.update({
      where: { id: requestId },
      data: { currentStepOrder: nextStep.stepOrder, approvalStatus: 'pending_chain' },
    })
    await notifyOutsideStepApprovers(prisma, requestId, nextStep.stepName, nextStep.approverId, nextStep.approverRole)
    return { finalized: false, nextStepOrder: nextStep.stepOrder }
  }

  await prisma.outsideWorkRequest.update({
    where: { id: requestId },
    data: { status: 'APPROVED', approvalStatus: 'approved', currentStepOrder: 0 },
  })

  await createNotification({
    userId: request.userId,
    type: 'OUTSIDE_APPROVED',
    title: '✅ คำขอออกนอกสถานที่ได้รับการอนุมัติแล้ว',
    message: 'คำขอของคุณผ่านขั้นตอนการอนุมัติทั้งหมดแล้ว',
    link: '/outside-work',
  })

  return { finalized: true, nextStepOrder: null }
}

export async function rejectOutsideWorkChain(
  prisma: PrismaClient,
  requestId: string,
  currentStepId: string,
  _actorId: string,
  comment: string,
  _ip: string,
): Promise<void> {
  const request = await prisma.outsideWorkRequest.findUnique({
    where: { id: requestId },
    select: { userId: true },
  })

  await prisma.outsideWorkApprovalStep.updateMany({
    where: {
      requestId,
      status: 'PENDING',
      id: { not: currentStepId },
    },
    data: { status: 'SKIPPED' },
  })

  await prisma.outsideWorkRequest.update({
    where: { id: requestId },
    data: { status: 'REJECTED', approvalStatus: 'rejected', currentStepOrder: 0 },
  })

  if (request?.userId) {
    await createNotification({
      userId: request.userId,
      type: 'OUTSIDE_REJECTED',
      title: '❌ คำขอออกนอกสถานที่ถูกปฏิเสธ',
      message: comment || 'คำขอถูกปฏิเสธโดยผู้อนุมัติ',
      link: '/outside-work',
    })
  }
}

// ── Notifications ───────────────────────────────────────────────────────────

async function notifyLeaveStepApprovers(
  prisma: PrismaClient,
  leaveId: string,
  stepName: string,
  approverId: string | null,
  approverRole: Role | null,
): Promise<void> {
  if (approverId) {
    await notifyUser(prisma, approverId, 'LEAVE_REQUEST', leaveId, stepName, '/approval-center')
    return
  }
  if (!approverRole) return
  await notifyLeaveRoleApprovers(prisma, leaveId, approverRole, stepName)
}

async function notifyLeaveRoleApprovers(
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
      link: '/approval-center',
    })),
  })
}

async function notifyOutsideStepApprovers(
  prisma: PrismaClient,
  requestId: string,
  stepName: string,
  approverId: string | null,
  approverRole: Role | null,
): Promise<void> {
  if (approverId) {
    await notifyUser(prisma, approverId, 'OUTSIDE_REQUEST', requestId, stepName, '/approval-center')
    return
  }
  if (!approverRole) return
  const approvers = await prisma.user.findMany({
    where: { role: approverRole, status: 'ACTIVE' },
    select: { id: true },
  })
  if (approvers.length === 0) return
  await prisma.notification.createMany({
    data: approvers.map((u) => ({
      userId: u.id,
      type: 'OUTSIDE_REQUEST' as const,
      title: `📋 รอการอนุมัติ: ${stepName}`,
      message: `คำขอออกนอกสถานที่ ID ${requestId} รอการอนุมัติในขั้น "${stepName}"`,
      link: '/approval-center',
    })),
  })
}

async function notifyUser(
  prisma: PrismaClient,
  userId: string,
  type: 'LEAVE_REQUEST' | 'OUTSIDE_REQUEST',
  requestId: string,
  stepName: string,
  link: string,
): Promise<void> {
  await createNotification({
    userId,
    type,
    title: `📋 รอการอนุมัติ: ${stepName}`,
    message: `คำขอ ID ${requestId} รอการอนุมัติในขั้น "${stepName}"`,
    link,
  })
}

// ── Shared step actions (used by step-approve routes + /api/approvals) ────────

export type StepActionResult = {
  success: true
  action: 'APPROVE' | 'REJECT'
  finalized: boolean
  nextStepOrder: number | null
  stepName: string
}

export async function executeLeaveStepAction(
  prisma: PrismaClient,
  leaveId: string,
  actorId: string,
  role: Role,
  action: 'APPROVE' | 'REJECT',
  comment: string | undefined,
  ip: string,
): Promise<StepActionResult | { error: string; status: number }> {
  const leave = await prisma.leaveRequest.findUnique({
    where: { id: leaveId },
    select: { id: true, status: true, chainConfigId: true, currentStepOrder: true, userId: true },
  })
  if (!leave) return { error: 'ไม่พบคำขอลา', status: 404 }
  if (!leave.chainConfigId) return { error: 'USE_LEGACY_APPROVAL', status: 409 }
  if (leave.status === 'APPROVED' || leave.status === 'REJECTED') {
    return { error: 'คำขอนี้ดำเนินการเสร็จสิ้นแล้ว', status: 400 }
  }

  const currentStep = await prisma.leaveApprovalStep.findFirst({
    where: { leaveRequestId: leaveId, stepOrder: leave.currentStepOrder, status: 'PENDING' },
  })
  if (!currentStep) return { error: 'ไม่พบขั้นตอนที่รออนุมัติ', status: 400 }

  if (!canUserActOnStep(currentStep, actorId, role)) {
    return { error: `คุณไม่มีสิทธิ์อนุมัติขั้นนี้`, status: 403 }
  }
  if (!(await canApproverActOnRequester(prisma, actorId, role, leave.userId))) {
    return { error: 'คุณไม่มีสิทธิ์อนุมัติคำขอของพนักงานคนนี้', status: 403 }
  }

  await prisma.leaveApprovalStep.update({
    where: { id: currentStep.id },
    data: {
      status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      actorId,
      comment: comment?.trim() || null,
      ip,
      actedAt: new Date(),
    },
  })

  if (action === 'APPROVE') {
    const { finalized, nextStepOrder } = await advanceLeaveChain(prisma, leaveId)
    return { success: true, action, finalized, nextStepOrder, stepName: currentStep.stepName }
  }

  await rejectLeaveChain(prisma, leaveId, currentStep.id, actorId, comment ?? '', ip)
  return { success: true, action, finalized: true, nextStepOrder: null, stepName: currentStep.stepName }
}

export async function executeOutsideWorkStepAction(
  prisma: PrismaClient,
  requestId: string,
  actorId: string,
  role: Role,
  action: 'APPROVE' | 'REJECT',
  comment: string | undefined,
  ip: string,
): Promise<StepActionResult | { error: string; status: number }> {
  const request = await prisma.outsideWorkRequest.findUnique({
    where: { id: requestId },
    select: { id: true, status: true, chainConfigId: true, currentStepOrder: true, userId: true },
  })
  if (!request) return { error: 'ไม่พบคำขอ', status: 404 }
  if (!request.chainConfigId) return { error: 'USE_LEGACY_APPROVAL', status: 409 }
  if (request.status === 'APPROVED' || request.status === 'REJECTED') {
    return { error: 'คำขอนี้ดำเนินการเสร็จสิ้นแล้ว', status: 400 }
  }

  const currentStep = await prisma.outsideWorkApprovalStep.findFirst({
    where: { requestId, stepOrder: request.currentStepOrder, status: 'PENDING' },
  })
  if (!currentStep) return { error: 'ไม่พบขั้นตอนที่รออนุมัติ', status: 400 }

  if (!canUserActOnStep(currentStep, actorId, role)) {
    return { error: 'คุณไม่มีสิทธิ์อนุมัติขั้นนี้', status: 403 }
  }
  if (!(await canApproverActOnRequester(prisma, actorId, role, request.userId))) {
    return { error: 'คุณไม่มีสิทธิ์อนุมัติคำขอของพนักงานคนนี้', status: 403 }
  }

  await prisma.outsideWorkApprovalStep.update({
    where: { id: currentStep.id },
    data: {
      status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      actorId,
      comment: comment?.trim() || null,
      ip,
      actedAt: new Date(),
    },
  })

  if (action === 'APPROVE') {
    const { finalized, nextStepOrder } = await advanceOutsideWorkChain(prisma, requestId)
    return { success: true, action, finalized, nextStepOrder, stepName: currentStep.stepName }
  }

  await rejectOutsideWorkChain(prisma, requestId, currentStep.id, actorId, comment ?? '', ip)
  return { success: true, action, finalized: true, nextStepOrder: null, stepName: currentStep.stepName }
}
