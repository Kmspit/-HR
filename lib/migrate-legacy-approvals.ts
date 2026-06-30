/**
 * Phase 3 — attach default approval chains to pending requests still on legacy flow.
 * Idempotent; safe to run on every deploy via ensureDbSchema.
 */
import type { PrismaClient } from '@prisma/client'
import { getDefaultChain, applyChainToLeave, applyChainToOutsideWork } from '@/lib/approval-chain'

export type LegacyMigrationResult = { leave: number; outside: number }

export async function migrateLegacyPendingApprovals(
  prisma: PrismaClient,
): Promise<LegacyMigrationResult> {
  let leave = 0
  let outside = 0

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

  if (leave > 0 || outside > 0) {
    console.log(`[MIGRATION] legacy approvals → chain: ${leave} leave, ${outside} outside`)
  }

  return { leave, outside }
}
