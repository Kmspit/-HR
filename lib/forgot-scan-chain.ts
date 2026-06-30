/**
 * Forgot-scan (แก้เวลา) — approval chain.
 * Mirrors weekly-plan pattern; requester = userId; finalizes with applyToAttendance().
 */
import type { ApprovalStepStatus, PrismaClient, Role } from '@prisma/client'
import { createNotification } from '@/lib/notifications'
import { canApproverActOnRequester } from '@/lib/org-scope'
import {
  canUserActOnStep,
  isOrgSupervisorTemplateStep,
} from '@/lib/approval-chain-shared'
import { resolveOrgSupervisorId, type StepActionResult } from '@/lib/approval-chain'

const SCAN_TYPE_LABEL: Record<string, string> = {
  checkin:     'เข้างาน',
  'lunch-out': 'พักกลางวันออก',
  'lunch-in':  'กลับจากพัก',
  checkout:    'ออกงาน',
}

const FIELD_MAP: Record<string, string> = {
  checkin:     'checkIn',
  'lunch-out': 'lunchOut',
  'lunch-in':  'lunchIn',
  checkout:    'checkOut',
}

export async function applyToAttendance(requestId: string, prisma: PrismaClient): Promise<void> {
  const req = await prisma.forgotScanRequest.findUnique({ where: { id: requestId } })
  if (!req) return

  const field = FIELD_MAP[req.scanType]
  if (!field) return

  let att = await prisma.attendance.findFirst({
    where: { userId: req.userId, date: req.date },
    orderBy: { sessionIndex: 'desc' },
  })

  if (req.scanType === 'checkin' && !att) {
    att = await prisma.attendance.create({
      data: {
        userId:            req.userId,
        date:              req.date,
        checkIn:           req.correctTime,
        sessionIndex:      1,
        status:            'NORMAL',
        isOutside:         false,
        lateMinutes:       0,
        earlyLeaveMinutes: 0,
        workMinutes:       0,
        attendanceStatus:  'completed',
        note:              `แก้ไขโดยระบบ forgot-scan #${req.id}`,
        editedById:        req.hrId ?? undefined,
      },
    })

    await prisma.forgotScanRequest.update({
      where: { id: requestId },
      data: { originalTime: null, attendanceId: att.id, appliedAt: new Date() },
    })
    return
  }

  if (!att) return

  const original = att[field as keyof typeof att] as Date | null

  await prisma.attendance.update({
    where: { id: att.id },
    data: {
      [field]:    req.correctTime,
      note:       `แก้ไขโดยระบบ forgot-scan #${req.id}`,
      editedById: req.hrId ?? undefined,
    },
  })

  await prisma.forgotScanRequest.update({
    where: { id: requestId },
    data: {
      originalTime: original ?? null,
      attendanceId: att.id,
      appliedAt:    new Date(),
    },
  })
}

export async function applyChainToForgotScan(
  prisma: PrismaClient,
  requestId: string,
  chainId: string,
  userId: string,
): Promise<void> {
  const chain = await prisma.approvalChainConfig.findUnique({
    where: { id: chainId },
    include: { steps: { orderBy: { stepOrder: 'asc' } } },
  })
  if (!chain || !chain.isActive) return

  const supervisorId = await resolveOrgSupervisorId(prisma, userId)

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
      forgotScanId: requestId,
      chainStepId:  s.id,
      stepOrder:    s.stepOrder,
      stepName:     s.stepName,
      approverRole,
      approverId,
      status,
    }
  })

  await prisma.forgotScanApprovalStep.createMany({ data: instanceSteps })

  const firstPending = instanceSteps
    .filter((s) => s.status === 'PENDING')
    .sort((a, b) => a.stepOrder - b.stepOrder)[0]

  if (!firstPending) {
    await prisma.forgotScanRequest.update({
      where: { id: requestId },
      data: { chainConfigId: chainId, currentStepOrder: 0, status: 'APPROVED' },
    })
    try {
      await applyToAttendance(requestId, prisma)
    } catch (err) {
      console.error('[forgot-scan apply]', err)
    }
    await createNotification({
      userId,
      type: 'FORGOT_SCAN_APPROVED',
      title: '✅ คำขอแก้ไขเวลาได้รับการอนุมัติ',
      message: 'คำขอของคุณผ่านขั้นตอนการอนุมัติทั้งหมดแล้ว',
      link: '/attendance',
    })
    return
  }

  await prisma.forgotScanRequest.update({
    where: { id: requestId },
    data: { chainConfigId: chainId, currentStepOrder: firstPending.stepOrder, status: 'PENDING' },
  })

  await notifyForgotScanStepApprovers(
    prisma,
    requestId,
    firstPending.stepName,
    firstPending.approverId,
    firstPending.approverRole,
  )
}

async function notifyForgotScanStepApprovers(
  prisma: PrismaClient,
  requestId: string,
  stepName: string,
  approverId: string | null,
  approverRole: Role | null,
): Promise<void> {
  void requestId
  const { notifyRole } = await import('@/lib/notifications')
  const title = `🔍 แก้ไขเวลารออนุมัติ — ${stepName}`
  const message = `ขั้นตอน: ${stepName}`
  const link = '/approvals'

  if (approverId) {
    await createNotification({ userId: approverId, type: 'FORGOT_SCAN_REQUEST', title, message, link })
    return
  }
  if (approverRole) {
    await notifyRole(approverRole, 'FORGOT_SCAN_REQUEST', title, message, link)
  }
}

export async function advanceForgotScanChain(
  prisma: PrismaClient,
  requestId: string,
): Promise<{ finalized: boolean; nextStepOrder: number | null }> {
  const req = await prisma.forgotScanRequest.findUnique({
    where: { id: requestId },
    select: { currentStepOrder: true, chainConfigId: true, userId: true, scanType: true },
  })
  if (!req?.chainConfigId) return { finalized: false, nextStepOrder: null }

  const nextStep = await prisma.forgotScanApprovalStep.findFirst({
    where: {
      forgotScanId: requestId,
      status: 'PENDING',
      stepOrder: { gt: req.currentStepOrder },
    },
    orderBy: { stepOrder: 'asc' },
  })

  if (nextStep) {
    await prisma.forgotScanRequest.update({
      where: { id: requestId },
      data: { currentStepOrder: nextStep.stepOrder },
    })
    await notifyForgotScanStepApprovers(
      prisma,
      requestId,
      nextStep.stepName,
      nextStep.approverId,
      nextStep.approverRole,
    )
    return { finalized: false, nextStepOrder: nextStep.stepOrder }
  }

  await prisma.forgotScanRequest.update({
    where: { id: requestId },
    data: { status: 'APPROVED', currentStepOrder: 0 },
  })

  try {
    await applyToAttendance(requestId, prisma)
  } catch (err) {
    console.error('[forgot-scan apply]', err)
  }

  const label = SCAN_TYPE_LABEL[req.scanType] ?? req.scanType
  await createNotification({
    userId: req.userId,
    type: 'FORGOT_SCAN_APPROVED',
    title: '✅ คำขอแก้ไขเวลาได้รับอนุมัติ',
    message: `HR อนุมัติแล้ว — ระบบได้อัปเดตเวลา${label}ของคุณเรียบร้อย`,
    link: '/attendance',
  })

  return { finalized: true, nextStepOrder: null }
}

async function rejectForgotScanChain(
  prisma: PrismaClient,
  requestId: string,
  currentStepId: string,
  comment: string,
  userId: string,
  scanType: string,
): Promise<void> {
  await prisma.forgotScanApprovalStep.updateMany({
    where: {
      forgotScanId: requestId,
      status: 'PENDING',
      id: { not: currentStepId },
    },
    data: { status: 'SKIPPED' },
  })

  await prisma.forgotScanRequest.update({
    where: { id: requestId },
    data: { status: 'REJECTED', currentStepOrder: 0 },
  })

  const label = SCAN_TYPE_LABEL[scanType] ?? scanType
  await createNotification({
    userId,
    type: 'FORGOT_SCAN_REJECTED',
    title: '❌ คำขอแก้ไขเวลาถูกปฏิเสธ',
    message: comment || `คำขอแก้ไขเวลา${label}ถูกปฏิเสธ`,
    link: '/forgot-scan',
  })
}

export async function executeForgotScanStepAction(
  prisma: PrismaClient,
  requestId: string,
  actorId: string,
  role: Role,
  action: 'APPROVE' | 'REJECT',
  comment: string | undefined,
  ip: string,
): Promise<StepActionResult | { error: string; status: number }> {
  const req = await prisma.forgotScanRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      chainConfigId: true,
      currentStepOrder: true,
      userId: true,
      scanType: true,
    },
  })
  if (!req) return { error: 'ไม่พบคำขอ', status: 404 }
  if (!req.chainConfigId) return { error: 'NO_CHAIN', status: 409 }
  if (req.status === 'APPROVED' || req.status === 'REJECTED') {
    return { error: 'คำขอนี้ดำเนินการเสร็จสิ้นแล้ว', status: 400 }
  }

  const currentStep = await prisma.forgotScanApprovalStep.findFirst({
    where: {
      forgotScanId: requestId,
      stepOrder: req.currentStepOrder,
      status: 'PENDING',
    },
  })
  if (!currentStep) return { error: 'ไม่พบขั้นตอนที่รออนุมัติ', status: 400 }

  const ceoOverride = role === 'CEO' || role === 'SUPER_ADMIN'
  if (!ceoOverride && !canUserActOnStep(currentStep, actorId, role)) {
    return { error: 'คุณไม่มีสิทธิ์อนุมัติขั้นนี้', status: 403 }
  }
  if (!ceoOverride && !(await canApproverActOnRequester(prisma, actorId, role, req.userId))) {
    return { error: 'คุณไม่มีสิทธิ์อนุมัติคำขอของพนักงานคนนี้', status: 403 }
  }

  await prisma.forgotScanApprovalStep.update({
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
    const { finalized, nextStepOrder } = await advanceForgotScanChain(prisma, requestId)
    return { success: true, action, finalized, nextStepOrder, stepName: currentStep.stepName }
  }

  await rejectForgotScanChain(
    prisma,
    requestId,
    currentStep.id,
    comment ?? '',
    req.userId,
    req.scanType,
  )
  return { success: true, action, finalized: true, nextStepOrder: null, stepName: currentStep.stepName }
}
