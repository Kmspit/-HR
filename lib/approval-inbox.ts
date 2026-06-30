import type { PrismaClient, Role } from '@prisma/client'
import { canUserActOnStep } from '@/lib/approval-chain-shared'
import { canApproverActOnRequester } from '@/lib/org-scope'

export type InboxLeaveItem = {
  id: string
  type: string
  startDate: Date
  endDate: Date
  days: number
  reason: string
  status: string
  chainConfigId: string | null
  currentStepOrder: number
  stepName: string | null
  user: { id: string; name: string; email: string; department: string | null; position: string | null; role: Role }
}

export type InboxOutsideItem = {
  id: string
  date: Date
  startTime: string
  endTime: string
  place: string
  purpose: string
  status: string
  approvalStatus: string | null
  chainConfigId: string | null
  currentStepOrder: number
  stepName: string | null
  user: { id: string; name: string; email: string; department: string | null; position: string | null; role: Role }
}

export async function getPendingLeaveForApprover(
  prisma: PrismaClient,
  userId: string,
  role: Role,
): Promise<InboxLeaveItem[]> {
  const rows = await prisma.leaveRequest.findMany({
    where: {
      status: { notIn: ['APPROVED', 'REJECTED'] },
    },
    include: {
      user: { select: { id: true, name: true, email: true, department: true, position: true, role: true } },
      stepLogs: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 150,
  })

  const out: InboxLeaveItem[] = []
  for (const row of rows) {
    if (row.chainConfigId) {
      const step = row.stepLogs.find(
        (s) => s.stepOrder === row.currentStepOrder && s.status === 'PENDING',
      )
      if (!step) continue
      if (!canUserActOnStep(step, userId, role)) continue
      if (!(await canApproverActOnRequester(prisma, userId, role, row.userId))) continue
      out.push({
        id: row.id,
        type: row.type,
        startDate: row.startDate,
        endDate: row.endDate,
        days: row.days,
        reason: row.reason,
        status: row.status,
        chainConfigId: row.chainConfigId,
        currentStepOrder: row.currentStepOrder,
        stepName: step.stepName,
        user: row.user,
      })
      continue
    }

    // Legacy 2-step (no chain)
    const legacyOk =
      (role === 'ADMIN' && row.status === 'PENDING') ||
      (role === 'MANAGER_HR' && row.status === 'ADMIN_APPROVED') ||
      (role === 'CEO' && (row.status === 'PENDING' || row.status === 'ADMIN_APPROVED'))
    if (legacyOk && (await canApproverActOnRequester(prisma, userId, role, row.userId))) {
      out.push({
        id: row.id,
        type: row.type,
        startDate: row.startDate,
        endDate: row.endDate,
        days: row.days,
        reason: row.reason,
        status: row.status,
        chainConfigId: null,
        currentStepOrder: row.currentStepOrder,
        stepName: row.status === 'PENDING' ? 'Admin อนุมัติ' : 'Manager HR อนุมัติ',
        user: row.user,
      })
    }
  }
  return out
}

export async function getPendingOutsideForApprover(
  prisma: PrismaClient,
  userId: string,
  role: Role,
): Promise<InboxOutsideItem[]> {
  const rows = await prisma.outsideWorkRequest.findMany({
    where: {
      status: { notIn: ['APPROVED', 'REJECTED'] },
    },
    include: {
      user: { select: { id: true, name: true, email: true, department: true, position: true, role: true } },
      stepLogs: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 150,
  })

  const out: InboxOutsideItem[] = []
  for (const row of rows) {
    if (row.chainConfigId) {
      const step = row.stepLogs.find(
        (s) => s.stepOrder === row.currentStepOrder && s.status === 'PENDING',
      )
      if (!step) continue
      if (!canUserActOnStep(step, userId, role)) continue
      if (!(await canApproverActOnRequester(prisma, userId, role, row.userId))) continue
      out.push({
        id: row.id,
        date: row.date,
        startTime: row.startTime,
        endTime: row.endTime,
        place: row.place,
        purpose: row.purpose,
        status: row.status,
        approvalStatus: row.approvalStatus,
        chainConfigId: row.chainConfigId,
        currentStepOrder: row.currentStepOrder,
        stepName: step.stepName,
        user: row.user,
      })
      continue
    }

    if (row.approvalStatus === 'pending_ceo' && role === 'CEO') {
      out.push({
        id: row.id,
        date: row.date,
        startTime: row.startTime,
        endTime: row.endTime,
        place: row.place,
        purpose: row.purpose,
        status: row.status,
        approvalStatus: row.approvalStatus,
        chainConfigId: null,
        currentStepOrder: row.currentStepOrder,
        stepName: 'CEO อนุมัติ',
        user: row.user,
      })
      continue
    }

    const legacyOk =
      (['ADMIN', 'MANAGER_HR', 'HR', 'CEO'].includes(role) && row.status === 'PENDING') ||
      (role === 'CEO' && row.status === 'ADMIN_APPROVED')
    if (legacyOk && (await canApproverActOnRequester(prisma, userId, role, row.userId))) {
      out.push({
        id: row.id,
        date: row.date,
        startTime: row.startTime,
        endTime: row.endTime,
        place: row.place,
        purpose: row.purpose,
        status: row.status,
        approvalStatus: row.approvalStatus,
        chainConfigId: null,
        currentStepOrder: row.currentStepOrder,
        stepName: 'อนุมัติ (legacy)',
        user: row.user,
      })
    }
  }
  return out
}
