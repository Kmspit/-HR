import type { PrismaClient, Role } from '@prisma/client'
import { createNotification, notifyRole, sendLineNotify } from '@/lib/notifications'

const ESCALATE_AFTER_MS = 48 * 60 * 60 * 1000
const HARD_ESCALATE_AFTER_MS = 72 * 60 * 60 * 1000
const REMIND_COOLDOWN_MS = 24 * 60 * 60 * 1000

type EscalationResult = {
  leaveReminded: number
  outsideReminded: number
  weeklyPlanReminded: number
  forgotScanReminded: number
  hardEscalated: number
}

async function resolveApproverIds(
  prisma: PrismaClient,
  approverId: string | null,
  approverRole: Role | null,
): Promise<string[]> {
  if (approverId) return [approverId]
  if (!approverRole) return []
  const rows = await prisma.user.findMany({
    where: { role: approverRole, status: 'ACTIVE' },
    select: { id: true },
  })
  return rows.map((r) => r.id)
}

async function recentlyNotified(
  prisma: PrismaClient,
  userId: string,
  dedupeKey: string,
): Promise<boolean> {
  const since = new Date(Date.now() - REMIND_COOLDOWN_MS)
  const hit = await prisma.notification.findFirst({
    where: {
      userId,
      createdAt: { gte: since },
      OR: [
        { message: { contains: dedupeKey } },
        { title: { contains: dedupeKey } },
      ],
    },
    select: { id: true },
  })
  return !!hit
}

async function remindApprovers(
  prisma: PrismaClient,
  approverIds: string[],
  dedupeKey: string,
  title: string,
  message: string,
): Promise<number> {
  let count = 0
  for (const userId of approverIds) {
    if (await recentlyNotified(prisma, userId, dedupeKey)) continue
    await createNotification({
      userId,
      type: 'SYSTEM',
      title,
      message,
      link: '/approval-center',
    })
    count += 1
  }
  return count
}

export async function runApprovalEscalation(prisma: PrismaClient): Promise<EscalationResult> {
  const now = Date.now()
  const softCutoff = new Date(now - ESCALATE_AFTER_MS)
  const hardCutoff = new Date(now - HARD_ESCALATE_AFTER_MS)

  let leaveReminded = 0
  let outsideReminded = 0
  let weeklyPlanReminded = 0
  let forgotScanReminded = 0
  let hardEscalated = 0

  const leaves = await prisma.leaveRequest.findMany({
    where: {
      chainConfigId: { not: null },
      status: { notIn: ['APPROVED', 'REJECTED'] },
      updatedAt: { lte: softCutoff },
    },
    include: {
      user: { select: { name: true } },
      stepLogs: true,
    },
  })

  for (const leave of leaves) {
    const step = leave.stepLogs.find(
      (s) => s.stepOrder === leave.currentStepOrder && s.status === 'PENDING',
    )
    if (!step) continue

    const dedupeKey = `leave-esc:${leave.id}`
    const approverIds = await resolveApproverIds(prisma, step.approverId, step.approverRole)
    leaveReminded += await remindApprovers(
      prisma,
      approverIds,
      dedupeKey,
      '⏰ คำขอลารออนุมัติเกิน 48 ชม.',
      `${leave.user.name} — ขั้น "${step.stepName}" ค้างอนุมัติ (${dedupeKey})`,
    )

    if (leave.updatedAt <= hardCutoff) {
      await notifyRole(
        'CEO',
        'SYSTEM',
        '🔺 Escalation: คำขอลาค้างเกิน 72 ชม.',
        `${leave.user.name} — ${step.stepName}`,
        '/approval-center',
      )
      await notifyRole(
        'MANAGER_HR',
        'SYSTEM',
        '🔺 Escalation: คำขอลาค้างเกิน 72 ชม.',
        `${leave.user.name} — ${step.stepName}`,
        '/approval-center',
      )
      hardEscalated += 1
    }
  }

  const outsideRows = await prisma.outsideWorkRequest.findMany({
    where: {
      chainConfigId: { not: null },
      status: { notIn: ['APPROVED', 'REJECTED'] },
      approvalStatus: 'pending_chain',
      updatedAt: { lte: softCutoff },
      deletedAt: null,
    },
    select: {
      id: true, currentStepOrder: true, updatedAt: true,
      user: { select: { name: true } },
      stepLogs: {
        select: { stepOrder: true, status: true, approverId: true, approverRole: true, stepName: true },
      },
    },
  })

  for (const row of outsideRows) {
    const step = row.stepLogs.find(
      (s) => s.stepOrder === row.currentStepOrder && s.status === 'PENDING',
    )
    if (!step) continue

    const dedupeKey = `outside-esc:${row.id}`
    const approverIds = await resolveApproverIds(prisma, step.approverId, step.approverRole)
    outsideReminded += await remindApprovers(
      prisma,
      approverIds,
      dedupeKey,
      '⏰ คำขอออกนอกสถานที่รออนุมัติเกิน 48 ชม.',
      `${row.user.name} — ขั้น "${step.stepName}" (${dedupeKey})`,
    )

    if (row.updatedAt <= hardCutoff) {
      await notifyRole(
        'CEO',
        'SYSTEM',
        '🔺 Escalation: ออกนอกสถานที่ค้างเกิน 72 ชม.',
        `${row.user.name} — ${step.stepName}`,
        '/approval-center',
      )
      await notifyRole(
        'MANAGER_HR',
        'SYSTEM',
        '🔺 Escalation: ออกนอกสถานที่ค้างเกิน 72 ชม.',
        `${row.user.name} — ${step.stepName}`,
        '/approval-center',
      )
      hardEscalated += 1
    }
  }

  // Weekly lawyer plan — same stuck-approver reminder/escalation leave and
  // outside-work already get. Previously this chain had no rescue at all: an
  // approver going on leave or being deactivated left the plan PENDING forever
  // with zero automated visibility.
  const weeklyPlans = await prisma.weeklyLawyerPlan.findMany({
    where: {
      chainConfigId: { not: null },
      status: { notIn: ['APPROVED', 'REJECTED'] },
      approvalStatus: 'pending_chain',
      updatedAt: { lte: softCutoff },
    },
    include: {
      lawyer: { select: { name: true } },
      stepLogs: true,
    },
  })

  for (const plan of weeklyPlans) {
    const step = plan.stepLogs.find(
      (s) => s.stepOrder === plan.currentStepOrder && s.status === 'PENDING',
    )
    if (!step) continue

    const dedupeKey = `weekly-plan-esc:${plan.id}`
    const approverIds = await resolveApproverIds(prisma, step.approverId, step.approverRole)
    weeklyPlanReminded += await remindApprovers(
      prisma,
      approverIds,
      dedupeKey,
      '⏰ แผนงานทนายรออนุมัติเกิน 48 ชม.',
      `${plan.lawyer.name} — ขั้น "${step.stepName}" ค้างอนุมัติ (${dedupeKey})`,
    )

    if (plan.updatedAt <= hardCutoff) {
      await notifyRole(
        'CEO',
        'SYSTEM',
        '🔺 Escalation: แผนงานทนายค้างเกิน 72 ชม.',
        `${plan.lawyer.name} — ${step.stepName}`,
        '/approval-center',
      )
      await notifyRole(
        'MANAGER_HR',
        'SYSTEM',
        '🔺 Escalation: แผนงานทนายค้างเกิน 72 ชม.',
        `${plan.lawyer.name} — ${step.stepName}`,
        '/approval-center',
      )
      hardEscalated += 1
    }
  }

  // Forgot-scan (แก้เวลา) — same rescue.
  const forgotScans = await prisma.forgotScanRequest.findMany({
    where: {
      chainConfigId: { not: null },
      status: { notIn: ['APPROVED', 'REJECTED'] },
      updatedAt: { lte: softCutoff },
    },
    include: {
      user: { select: { name: true } },
      stepLogs: true,
    },
  })

  for (const req of forgotScans) {
    const step = req.stepLogs.find(
      (s) => s.stepOrder === req.currentStepOrder && s.status === 'PENDING',
    )
    if (!step) continue

    const dedupeKey = `forgot-scan-esc:${req.id}`
    const approverIds = await resolveApproverIds(prisma, step.approverId, step.approverRole)
    forgotScanReminded += await remindApprovers(
      prisma,
      approverIds,
      dedupeKey,
      '⏰ คำขอแก้ไขเวลารออนุมัติเกิน 48 ชม.',
      `${req.user.name} — ขั้น "${step.stepName}" ค้างอนุมัติ (${dedupeKey})`,
    )

    if (req.updatedAt <= hardCutoff) {
      await notifyRole(
        'CEO',
        'SYSTEM',
        '🔺 Escalation: คำขอแก้ไขเวลาค้างเกิน 72 ชม.',
        `${req.user.name} — ${step.stepName}`,
        '/approval-center',
      )
      await notifyRole(
        'MANAGER_HR',
        'SYSTEM',
        '🔺 Escalation: คำขอแก้ไขเวลาค้างเกิน 72 ชม.',
        `${req.user.name} — ${step.stepName}`,
        '/approval-center',
      )
      hardEscalated += 1
    }
  }

  if (leaveReminded + outsideReminded + weeklyPlanReminded + forgotScanReminded + hardEscalated > 0) {
    await sendLineNotify(
      `\n⏰ [HRFlow] Approval escalation\nลา: ${leaveReminded} · ออกนอก: ${outsideReminded} · แผนงาน: ${weeklyPlanReminded} · แก้เวลา: ${forgotScanReminded} · hard: ${hardEscalated}`,
    ).catch(() => {})
  }

  return { leaveReminded, outsideReminded, weeklyPlanReminded, forgotScanReminded, hardEscalated }
}
