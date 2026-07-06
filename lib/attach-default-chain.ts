/**
 * Attach default approval chains to requests still missing chainConfigId.
 * Replaces legacy 2-step executors — idempotent.
 */
import type { PrismaClient } from '@prisma/client'
import { getDefaultChain, applyChainToLeave, applyChainToOutsideWork } from '@/lib/approval-chain'
import { applyChainToWeeklyPlan } from '@/lib/weekly-plan-chain'
import { applyChainToForgotScan } from '@/lib/forgot-scan-chain'

export type ChainAttachResult = { leave: number; outside: number; weekly: number; forgotScan: number }

export async function attachAllPendingDefaultChains(
  prisma: PrismaClient,
): Promise<ChainAttachResult> {
  let leave = 0
  let outside = 0
  let weekly = 0
  let forgotScan = 0

  const leaveChain = await getDefaultChain(prisma, 'LEAVE')
  if (leaveChain) {
    const pendingRows = await prisma.leaveRequest.findMany({
      where: { chainConfigId: null, status: 'PENDING' },
      select: { id: true, userId: true },
    })
    for (const row of pendingRows) {
      await applyChainToLeave(prisma, row.id, leaveChain.id, row.userId)
      leave += 1
    }

    const midRows = await prisma.leaveRequest.findMany({
      where: { chainConfigId: null, status: 'ADMIN_APPROVED' },
      select: { id: true, userId: true },
    })
    for (const row of midRows) {
      await applyChainToLeave(prisma, row.id, leaveChain.id, row.userId)
      const steps = await prisma.leaveApprovalStep.findMany({
        where: { leaveRequestId: row.id },
        orderBy: { stepOrder: 'asc' },
      })
      const firstPending = steps.find((s) => s.status === 'PENDING')
      if (firstPending) {
        await prisma.leaveApprovalStep.update({
          where: { id: firstPending.id },
          data: { status: 'APPROVED', actedAt: new Date() },
        })
        const next = steps.find((s) => s.stepOrder > firstPending.stepOrder && s.status === 'PENDING')
        await prisma.leaveRequest.update({
          where: { id: row.id },
          data: { currentStepOrder: next?.stepOrder ?? firstPending.stepOrder, status: 'PENDING' },
        })
      }
      leave += 1
    }
  }

  const outsideChain = await getDefaultChain(prisma, 'OUTSIDE_WORK')
  if (outsideChain) {
    const rows = await prisma.outsideWorkRequest.findMany({
      where: { chainConfigId: null, status: { notIn: ['APPROVED', 'REJECTED'] } },
      select: { id: true, userId: true },
    })
    for (const row of rows) {
      await applyChainToOutsideWork(prisma, row.id, outsideChain.id, row.userId)
      outside += 1
    }
  }

  const weeklyChain = await getDefaultChain(prisma, 'WEEKLY_PLAN')
  if (weeklyChain) {
    const rows = await prisma.weeklyLawyerPlan.findMany({
      where: { chainConfigId: null, status: { notIn: ['APPROVED', 'REJECTED'] } },
      select: { id: true, lawyerId: true, approvalStatus: true, status: true },
    })
    for (const row of rows) {
      await applyChainToWeeklyPlan(prisma, row.id, weeklyChain.id, row.lawyerId)
      if (row.approvalStatus === 'pending_executive' || row.status === 'ADMIN_APPROVED') {
        const steps = await prisma.weeklyPlanApprovalStep.findMany({
          where: { weeklyPlanId: row.id },
          orderBy: { stepOrder: 'asc' },
        })
        for (const s of steps) {
          if (s.status !== 'PENDING') continue
          if (s.approverRole === 'ADMIN' || s.stepOrder === steps.length) break
          await prisma.weeklyPlanApprovalStep.update({
            where: { id: s.id },
            data: { status: 'APPROVED', actedAt: new Date() },
          })
        }
        const nextPending = await prisma.weeklyPlanApprovalStep.findFirst({
          where: { weeklyPlanId: row.id, status: 'PENDING' },
          orderBy: { stepOrder: 'asc' },
        })
        if (nextPending) {
          await prisma.weeklyLawyerPlan.update({
            where: { id: row.id },
            data: { currentStepOrder: nextPending.stepOrder, approvalStatus: 'pending_chain' },
          })
        }
      }
      weekly += 1
    }
  }

  const forgotChain = await getDefaultChain(prisma, 'FORGOT_SCAN')
  if (forgotChain) {
    const pendingRows = await prisma.forgotScanRequest.findMany({
      where: { chainConfigId: null, status: 'PENDING' },
      select: { id: true, userId: true },
    })
    for (const row of pendingRows) {
      await applyChainToForgotScan(prisma, row.id, forgotChain.id, row.userId)
      forgotScan += 1
    }

    const midRows = await prisma.forgotScanRequest.findMany({
      where: { chainConfigId: null, status: 'ADMIN_APPROVED' },
      select: { id: true, userId: true },
    })
    for (const row of midRows) {
      await applyChainToForgotScan(prisma, row.id, forgotChain.id, row.userId)
      const steps = await prisma.forgotScanApprovalStep.findMany({
        where: { forgotScanId: row.id },
        orderBy: { stepOrder: 'asc' },
      })
      const firstPending = steps.find((s) => s.status === 'PENDING')
      if (firstPending) {
        await prisma.forgotScanApprovalStep.update({
          where: { id: firstPending.id },
          data: { status: 'APPROVED', actedAt: new Date() },
        })
        const next = steps.find((s) => s.stepOrder > firstPending.stepOrder && s.status === 'PENDING')
        await prisma.forgotScanRequest.update({
          where: { id: row.id },
          data: { currentStepOrder: next?.stepOrder ?? firstPending.stepOrder, status: 'PENDING' },
        })
      }
      forgotScan += 1
    }
  }

  if (leave > 0 || outside > 0 || weekly > 0 || forgotScan > 0) {
    console.log(`[attach-default-chain] ${leave} leave, ${outside} outside, ${weekly} weekly, ${forgotScan} forgot-scan`)
  }

  return { leave, outside, weekly, forgotScan }
}

/** Attach default chain to a single leave request if missing. Returns true if attached. */
export async function attachDefaultChainForLeave(
  prisma: PrismaClient,
  leaveId: string,
  userId: string,
): Promise<boolean> {
  const row = await prisma.leaveRequest.findUnique({
    where: { id: leaveId },
    select: { chainConfigId: true },
  })
  if (!row || row.chainConfigId) return false
  const chain = await getDefaultChain(prisma, 'LEAVE')
  if (!chain) return false
  await applyChainToLeave(prisma, leaveId, chain.id, userId)
  return true
}

export async function attachDefaultChainForOutside(
  prisma: PrismaClient,
  requestId: string,
  userId: string,
): Promise<boolean> {
  const row = await prisma.outsideWorkRequest.findUnique({
    where: { id: requestId },
    select: { chainConfigId: true },
  })
  if (!row || row.chainConfigId) return false
  const chain = await getDefaultChain(prisma, 'OUTSIDE_WORK')
  if (!chain) return false
  await applyChainToOutsideWork(prisma, requestId, chain.id, userId)
  await prisma.outsideWorkRequest.update({
    where: { id: requestId },
    data: { approvalStatus: 'pending_chain' },
    select: { id: true },
  })
  return true
}

export async function attachDefaultChainForWeekly(
  prisma: PrismaClient,
  planId: string,
  lawyerId: string,
): Promise<boolean> {
  const row = await prisma.weeklyLawyerPlan.findUnique({
    where: { id: planId },
    select: { chainConfigId: true },
  })
  if (!row || row.chainConfigId) return false
  const chain = await getDefaultChain(prisma, 'WEEKLY_PLAN')
  if (!chain) return false
  await applyChainToWeeklyPlan(prisma, planId, chain.id, lawyerId)
  return true
}

export async function attachDefaultChainForForgotScan(
  prisma: PrismaClient,
  requestId: string,
  userId: string,
): Promise<boolean> {
  const row = await prisma.forgotScanRequest.findUnique({
    where: { id: requestId },
    select: { chainConfigId: true },
  })
  if (!row || row.chainConfigId) return false
  const chain = await getDefaultChain(prisma, 'FORGOT_SCAN')
  if (!chain) return false
  await applyChainToForgotScan(prisma, requestId, chain.id, userId)
  return true
}
