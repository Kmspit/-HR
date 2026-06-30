/**
 * Phase 3 — attach default approval chains to pending requests still on legacy flow.
 * Idempotent; safe to run on every deploy via ensureDbSchema.
 */
import type { PrismaClient } from '@prisma/client'
import { getDefaultChain, applyChainToLeave, applyChainToOutsideWork } from '@/lib/approval-chain'
import { applyChainToWeeklyPlan } from '@/lib/weekly-plan-chain'

export type LegacyMigrationResult = { leave: number; outside: number; weekly: number }

export async function migrateLegacyPendingApprovals(
  prisma: PrismaClient,
): Promise<LegacyMigrationResult> {
  let leave = 0
  let outside = 0
  let weekly = 0

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
      where: {
        chainConfigId: null,
        status: { notIn: ['APPROVED', 'REJECTED'] },
      },
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
      where: {
        chainConfigId: null,
        status: { notIn: ['APPROVED', 'REJECTED'] },
      },
      select: { id: true, lawyerId: true, approvalStatus: true, status: true },
    })
    for (const row of rows) {
      await applyChainToWeeklyPlan(prisma, row.id, weeklyChain.id, row.lawyerId)
      if (
        row.approvalStatus === 'pending_executive' ||
        row.status === 'ADMIN_APPROVED'
      ) {
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

  if (leave > 0 || outside > 0 || weekly > 0) {
    console.log(`[MIGRATION] legacy approvals → chain: ${leave} leave, ${outside} outside, ${weekly} weekly`)
  }

  return { leave, outside, weekly }
}
