/**
 * Weekly lawyer plan — approval chain (Phase 3 continuation).
 * Mirrors leave/outside pattern; requester = lawyerId.
 */
import type { ApprovalStepStatus, PrismaClient, Role } from '@prisma/client'
import { createNotification, notifyRole } from '@/lib/notifications'
import { canApproverActOnRequester } from '@/lib/org-scope'
import {
  canUserActOnStep,
  isOrgSupervisorTemplateStep,
  type ApprovalStepRow,
} from '@/lib/approval-chain-shared'
import { resolveOrgSupervisorId, notifyChainDataIssue, type StepActionResult } from '@/lib/approval-chain'

export async function applyChainToWeeklyPlan(
  prisma: PrismaClient,
  planId: string,
  chainId: string,
  lawyerId: string,
): Promise<void> {
  const chain = await prisma.approvalChainConfig.findUnique({
    where: { id: chainId },
    include: { steps: { orderBy: { stepOrder: 'asc' } } },
  })
  if (!chain || !chain.isActive) return

  const stepCount = await prisma.weeklyPlanApprovalStep.count({ where: { weeklyPlanId: planId } })
  if (stepCount > 0) return

  const claim = await prisma.weeklyLawyerPlan.updateMany({
    where: { id: planId, chainConfigId: null },
    data: { chainConfigId: chainId },
  })
  if (claim.count === 0) return

  const supervisorId = await resolveOrgSupervisorId(prisma, lawyerId)

  const instanceSteps = chain.steps.map((s) => {
    let approverId = s.approverId
    let approverRole = s.approverRole
    let status: ApprovalStepStatus = 'PENDING'

    if (isOrgSupervisorTemplateStep(s)) {
      approverId = supervisorId
      approverRole = null
      if (!approverId) status = 'SKIPPED'
    }

    return {
      weeklyPlanId: planId,
      chainStepId:  s.id,
      stepOrder:    s.stepOrder,
      stepName:     s.stepName,
      approverRole,
      approverId,
      status,
    }
  })

  await prisma.weeklyPlanApprovalStep.createMany({ data: instanceSteps })

  const firstPending = instanceSteps
    .filter((s) => s.status === 'PENDING')
    .sort((a, b) => a.stepOrder - b.stepOrder)[0]

  if (!firstPending) {
    await prisma.weeklyLawyerPlan.update({
      where: { id: planId },
      data: {
        currentStepOrder: 0,
        status: 'APPROVED',
        approvalStatus: 'approved',
      },
    })
    await createNotification({
      userId: lawyerId,
      type: 'WEEKLY_PLAN_APPROVED',
      title: '✅ แผนงานสัปดาห์ได้รับการอนุมัติแล้ว',
      message: 'แผนงานของคุณผ่านขั้นตอนการอนุมัติทั้งหมดแล้ว',
      link: '/weekly-plan',
    })
    return
  }

  await prisma.weeklyLawyerPlan.update({
    where: { id: planId },
    data: {
      currentStepOrder: firstPending.stepOrder,
      status: 'PENDING',
      approvalStatus: 'pending_chain',
    },
  })

  await notifyWeeklyStepApprovers(
    prisma,
    planId,
    firstPending.stepName,
    firstPending.approverId,
    firstPending.approverRole,
  )
}

async function notifyWeeklyStepApprovers(
  prisma: PrismaClient,
  planId: string,
  stepName: string,
  approverId: string | null,
  approverRole: Role | null,
): Promise<void> {
  void planId
  const title = `📋 แผนงานทนายรออนุมัติ — ${stepName}`
  const message = `ขั้นตอน: ${stepName}`
  const link = '/approval-center'

  if (approverId) {
    await createNotification({ userId: approverId, type: 'WEEKLY_PLAN_DUE', title, message, link })
    return
  }
  if (approverRole) {
    await notifyRole(approverRole, 'WEEKLY_PLAN_DUE', title, message, link)
  }
}

export async function advanceWeeklyPlanChain(
  prisma: PrismaClient,
  planId: string,
): Promise<{ finalized: boolean; nextStepOrder: number | null }> {
  const plan = await prisma.weeklyLawyerPlan.findUnique({
    where: { id: planId },
    select: { currentStepOrder: true, chainConfigId: true, lawyerId: true },
  })
  if (!plan?.chainConfigId) return { finalized: false, nextStepOrder: null }

  const nextStep = await prisma.weeklyPlanApprovalStep.findFirst({
    where: {
      weeklyPlanId: planId,
      status: 'PENDING',
      stepOrder: { gt: plan.currentStepOrder },
    },
    orderBy: { stepOrder: 'asc' },
  })

  if (nextStep) {
    await prisma.weeklyLawyerPlan.update({
      where: { id: planId },
      data: { currentStepOrder: nextStep.stepOrder, approvalStatus: 'pending_chain' },
    })
    await notifyWeeklyStepApprovers(
      prisma,
      planId,
      nextStep.stepName,
      nextStep.approverId,
      nextStep.approverRole,
    )
    return { finalized: false, nextStepOrder: nextStep.stepOrder }
  }

  await prisma.weeklyLawyerPlan.update({
    where: { id: planId },
    data: {
      status: 'APPROVED',
      approvalStatus: 'approved',
      currentStepOrder: 0,
    },
  })

  await createNotification({
    userId: plan.lawyerId,
    type: 'WEEKLY_PLAN_APPROVED',
    title: '✅ แผนงานสัปดาห์ได้รับการอนุมัติสมบูรณ์',
    message: 'แผนงานของคุณได้รับการอนุมัติแล้ว',
    link: '/weekly-plan',
  })

  return { finalized: true, nextStepOrder: null }
}

async function rejectWeeklyPlanChain(
  prisma: PrismaClient,
  planId: string,
  currentStepId: string,
  comment: string,
  lawyerId: string,
): Promise<void> {
  await prisma.weeklyPlanApprovalStep.updateMany({
    where: {
      weeklyPlanId: planId,
      status: 'PENDING',
      id: { not: currentStepId },
    },
    data: { status: 'SKIPPED' },
  })

  await prisma.weeklyLawyerPlan.update({
    where: { id: planId },
    data: { status: 'REJECTED', approvalStatus: 'rejected', currentStepOrder: 0 },
  })

  await createNotification({
    userId: lawyerId,
    type: 'WEEKLY_PLAN_REJECTED',
    title: '❌ แผนงานสัปดาห์ถูกปฏิเสธ',
    message: comment || 'แผนงานถูกปฏิเสธโดยผู้อนุมัติ',
    link: '/weekly-plan',
  })
}

export async function executeWeeklyPlanStepAction(
  prisma: PrismaClient,
  planId: string,
  actorId: string,
  role: Role,
  action: 'APPROVE' | 'REJECT',
  comment: string | undefined,
  ip: string,
): Promise<StepActionResult | { error: string; status: number }> {
  const plan = await prisma.weeklyLawyerPlan.findUnique({
    where: { id: planId },
    select: {
      id: true,
      status: true,
      chainConfigId: true,
      currentStepOrder: true,
      lawyerId: true,
    },
  })
  if (!plan) return { error: 'ไม่พบแผนงาน', status: 404 }
  if (!plan.chainConfigId) return { error: 'NO_CHAIN', status: 409 }
  if (plan.status === 'APPROVED' || plan.status === 'REJECTED') {
    return { error: 'แผนงานนี้ดำเนินการเสร็จสิ้นแล้ว', status: 400 }
  }

  let currentStep = await prisma.weeklyPlanApprovalStep.findFirst({
    where: {
      weeklyPlanId: planId,
      stepOrder: plan.currentStepOrder,
      status: 'PENDING',
    },
  })

  const ceoOverride = role === 'CEO' || role === 'SUPER_ADMIN'

  if (!currentStep) {
    if (!ceoOverride) return { error: 'ไม่พบขั้นตอนที่รออนุมัติ', status: 400 }
    // currentStepOrder doesn't point at a PENDING step (e.g. stale/corrupted
    // data from a legacy migration) — let CEO/SUPER_ADMIN fall back to the
    // actual next PENDING step, same rescue leave/outside-work/forgot-scan
    // already have, so the plan isn't permanently stuck.
    currentStep = await prisma.weeklyPlanApprovalStep.findFirst({
      where: { weeklyPlanId: planId, status: 'PENDING' },
      orderBy: { stepOrder: 'asc' },
    })
    if (!currentStep) return { error: 'ไม่พบขั้นตอนที่รออนุมัติ', status: 400 }
    await notifyChainDataIssue('แผนงานทนาย', planId, '/approval-center')
  }

  if (!ceoOverride && !canUserActOnStep(currentStep, actorId, role)) {
    return { error: 'คุณไม่มีสิทธิ์อนุมัติขั้นนี้', status: 403 }
  }
  if (!ceoOverride && !(await canApproverActOnRequester(prisma, actorId, role, plan.lawyerId))) {
    return { error: 'คุณไม่มีสิทธิ์อนุมัติแผนงานของทนายคนนี้', status: 403 }
  }

  const claim = await prisma.weeklyPlanApprovalStep.updateMany({
    where: {
      id: currentStep.id,
      weeklyPlanId: planId,
      stepOrder: currentStep.stepOrder,
      status: 'PENDING',
    },
    data: {
      status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      actorId,
      comment: comment?.trim() || null,
      ip,
      actedAt: new Date(),
    },
  })
  if (claim.count === 0) {
    return { error: 'ขั้นตอนนี้ถูกดำเนินการแล้ว กรุณารีเฟรช', status: 409 }
  }
  if (currentStep.stepOrder !== plan.currentStepOrder) {
    // Realign the plan's pointer to the step we actually claimed (fallback
    // path above) so advanceWeeklyPlanChain's "find next step" lookup is
    // anchored correctly instead of using the stale currentStepOrder.
    await prisma.weeklyLawyerPlan.update({
      where: { id: planId },
      data: { currentStepOrder: currentStep.stepOrder },
    })
  }

  if (action === 'APPROVE') {
    const { finalized, nextStepOrder } = await advanceWeeklyPlanChain(prisma, planId)
    return { success: true, action, finalized, nextStepOrder, stepName: currentStep.stepName }
  }

  await rejectWeeklyPlanChain(prisma, planId, currentStep.id, comment ?? '', plan.lawyerId)
  return { success: true, action, finalized: true, nextStepOrder: null, stepName: currentStep.stepName }
}
