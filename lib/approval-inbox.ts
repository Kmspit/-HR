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
    }
  }
  return out
}

export type InboxWeeklyItem = {
  id: string
  weekStart: Date
  weekEnd: Date
  status: string
  isLate: boolean
  note: string | null
  stepName: string | null
  lawyer: { name: string; email: string }
  days: { dayOfWeek: number; place: string | null; purpose: string | null }[]
}

export async function getPendingWeeklyForApprover(
  prisma: PrismaClient,
  userId: string,
  role: Role,
): Promise<InboxWeeklyItem[]> {
  const rows = await prisma.weeklyLawyerPlan.findMany({
    where: { status: { notIn: ['APPROVED', 'REJECTED'] } },
    include: {
      lawyer: { select: { id: true, name: true, email: true } },
      stepLogs: true,
      days: { select: { dayOfWeek: true, place: true, purpose: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 80,
  })

  const out: InboxWeeklyItem[] = []
  for (const row of rows) {
    if (!row.chainConfigId) continue
    const step = row.stepLogs.find(
      (s) => s.stepOrder === row.currentStepOrder && s.status === 'PENDING',
    )
    if (!step) continue
    const ceoOverride = role === 'CEO' || role === 'SUPER_ADMIN'
    if (!ceoOverride && !canUserActOnStep(step, userId, role)) continue
    if (!ceoOverride && !(await canApproverActOnRequester(prisma, userId, role, row.lawyerId))) continue
    out.push({
      id: row.id,
      weekStart: row.weekStart,
      weekEnd: row.weekEnd,
      status: row.status,
      isLate: row.isLate,
      note: row.note,
      stepName: step.stepName,
      lawyer: { name: row.lawyer.name, email: row.lawyer.email },
      days: row.days,
    })
  }
  return out
}

export type ApproverInboxCounts = {
  leave: number
  outside: number
  total: number
}

/** Count items this user can act on in /approvals (org-scoped for TL/MANAGER). */
export async function getApproverInboxCounts(
  prisma: PrismaClient,
  userId: string,
  role: Role,
): Promise<ApproverInboxCounts> {
  const [leaveRows, outsideRows] = await Promise.all([
    getPendingLeaveForApprover(prisma, userId, role),
    getPendingOutsideForApprover(prisma, userId, role),
  ])
  return {
    leave: leaveRows.length,
    outside: outsideRows.length,
    total: leaveRows.length + outsideRows.length,
  }
}
