import type { PrismaClient, Role } from '@prisma/client'
import { canUserActOnStep } from '@/lib/approval-chain-shared'
import { canApproverActOnRequester } from '@/lib/org-scope'
import { hasPermission, canSeeForgotScanInbox } from '@/lib/access-control'
import { attachAllPendingDefaultChains } from '@/lib/attach-default-chain'

let chainAttachPromise: Promise<unknown> | null = null

async function ensureChainsAttached(prisma: PrismaClient): Promise<void> {
  if (!chainAttachPromise) {
    chainAttachPromise = attachAllPendingDefaultChains(prisma).catch(() => {})
  }
  await chainAttachPromise
}

export type InboxForgotScanItem = {
  id: string
  date: Date
  scanType: string
  correctTime: Date
  reason: string
  status: string
  stepName: string | null
  user: { id: string; name: string; email: string; department: string | null; position: string | null; role: Role }
}
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
  await ensureChainsAttached(prisma)

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
  await ensureChainsAttached(prisma)

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

function canSeeWeeklyInbox(role: Role): boolean {
  return role === 'CEO' || role === 'ADMIN' || hasPermission(role, 'approve_weekly_plan')
}

export async function getPendingForgotScanForApprover(
  prisma: PrismaClient,
  userId: string,
  role: Role,
): Promise<InboxForgotScanItem[]> {
  if (!canSeeForgotScanInbox(role)) return []

  await ensureChainsAttached(prisma)

  const rows = await prisma.forgotScanRequest.findMany({
    where: { status: { notIn: ['APPROVED', 'REJECTED', 'ADMIN_REJECTED'] } },
    include: {
      user: { select: { id: true, name: true, email: true, department: true, position: true, role: true } },
      stepLogs: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const out: InboxForgotScanItem[] = []
  for (const row of rows) {
    if (row.chainConfigId) {
      const step = row.stepLogs.find(
        (s) => s.stepOrder === row.currentStepOrder && s.status === 'PENDING',
      )
      if (!step) continue
      const ceoOverride = role === 'CEO' || role === 'SUPER_ADMIN'
      if (!ceoOverride && !canUserActOnStep(step, userId, role)) continue
      if (!ceoOverride && !(await canApproverActOnRequester(prisma, userId, role, row.userId))) continue
      out.push({
        id: row.id,
        date: row.date,
        scanType: row.scanType,
        correctTime: row.correctTime,
        reason: row.reason,
        status: row.status,
        stepName: step.stepName,
        user: row.user,
      })
    }
  }
  return out
}

/** Short label for Approval Center dashboard card (4 core types only). */
export function formatApprovalCenterSummary(counts: ApprovalCenterInboxCounts, role: Role): string {
  const parts: string[] = []
  if (counts.leave > 0) parts.push(`ลา ${counts.leave}`)
  if (counts.outside > 0 && hasPermission(role, 'approve_outside_work')) {
    parts.push(`นอก ${counts.outside}`)
  }
  if (counts.weekly > 0 && canSeeWeeklyInbox(role)) parts.push(`แผน ${counts.weekly}`)
  if (counts.forgotScan > 0 && canSeeForgotScanInbox(role)) parts.push(`แก้เวลา ${counts.forgotScan}`)
  return parts.length > 0 ? parts.join(' · ') : 'ไม่มีรายการค้าง'
}

export type ApprovalCenterInboxCounts = {
  leave: number
  outside: number
  weekly: number
  forgotScan: number
  total: number
}

/** Count items visible in /approval-center (4 types, org-scoped). */
export async function getApprovalCenterInboxCounts(
  prisma: PrismaClient,
  userId: string,
  role: Role,
): Promise<ApprovalCenterInboxCounts> {
  const [leaveRows, outsideRows, weeklyRows, forgotRows] = await Promise.all([
    getPendingLeaveForApprover(prisma, userId, role),
    getPendingOutsideForApprover(prisma, userId, role),
    canSeeWeeklyInbox(role)
      ? getPendingWeeklyForApprover(prisma, userId, role)
      : Promise.resolve([]),
    getPendingForgotScanForApprover(prisma, userId, role),
  ])
  const leave = leaveRows.length
  const outside = outsideRows.length
  const weekly = weeklyRows.length
  const forgotScan = forgotRows.length
  return {
    leave,
    outside,
    weekly,
    forgotScan,
    total: leave + outside + weekly + forgotScan,
  }
}
