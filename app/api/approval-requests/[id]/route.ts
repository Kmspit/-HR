import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'
import { headers } from 'next/headers'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const request = await prisma.approvalRequest.findUnique({
    where: { id },
    include: {
      requestedBy: { select: { id: true, name: true, role: true, department: true } },
      steps: {
        orderBy: { stepOrder: 'asc' },
        include: {
          actor:    { select: { id: true, name: true } },
          approver: { select: { id: true, name: true } },
        },
      },
    },
  })
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Fetch activity log for this doc
  const activity = await prisma.activityLog.findMany({
    where: { docType: request.docType, docId: request.docId },
    orderBy: { createdAt: 'asc' },
  })

  // Fetch signatures for this doc
  const signatures = await prisma.digitalSignature.findMany({
    where: { docType: request.docType, docId: request.docId },
    include: { signedBy: { select: { id: true, name: true } } },
    orderBy: { signedAt: 'asc' },
  })

  return NextResponse.json({ ...request, activity, signatures })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const ip = (await headers()).get('x-forwarded-for') ?? 'unknown'
  const body = await req.json()
  const { action, comment, stepId } = body

  if (!['APPROVE', 'REJECT', 'REVISE'].includes(action)) {
    return NextResponse.json({ error: 'action must be APPROVE | REJECT | REVISE' }, { status: 400 })
  }

  const request = await prisma.approvalRequest.findUnique({
    where: { id },
    include: { steps: { orderBy: { stepOrder: 'asc' } }, requestedBy: { select: { id: true, name: true } } },
  })
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (['CEO_APPROVED', 'APPROVED', 'REJECTED'].includes(request.status)) {
    return NextResponse.json({ error: 'คำขอนี้ดำเนินการเสร็จสิ้นแล้ว' }, { status: 400 })
  }

  // Find the current active step
  const activeStep = stepId
    ? request.steps.find((s) => s.id === stepId)
    : request.steps.find((s) => s.stepOrder === request.currentStep)

  if (!activeStep) return NextResponse.json({ error: 'Step not found' }, { status: 404 })

  const { id: userId, role } = session.user

  // Check permission: approver must match
  const isAssignedApprover = activeStep.approverId === userId ||
    (activeStep.approverRole && activeStep.approverRole === role) ||
    ['SUPER_ADMIN', 'CEO'].includes(role)

  if (!isAssignedApprover) {
    return NextResponse.json({ error: 'คุณไม่มีสิทธิ์อนุมัติขั้นตอนนี้' }, { status: 403 })
  }

  let newStepStatus: string
  let newRequestStatus: string
  let notifType: 'APPROVAL_APPROVED' | 'APPROVAL_REJECTED' | 'APPROVAL_REVISION'
  let notifTitle: string

  if (action === 'REJECT') {
    newStepStatus    = 'REJECTED'
    newRequestStatus = 'REJECTED'
    notifType        = 'APPROVAL_REJECTED'
    notifTitle       = `❌ คำขอถูกปฏิเสธ: ${request.title}`
  } else if (action === 'REVISE') {
    newStepStatus    = 'REVISION_REQUIRED'
    newRequestStatus = 'REVISION_REQUIRED'
    notifType        = 'APPROVAL_REVISION'
    notifTitle       = `⚠️ ต้องแก้ไข: ${request.title}`
  } else {
    newStepStatus = 'APPROVED'
    // Check if this is the last step
    const isLastStep = activeStep.stepOrder >= request.totalSteps
    if (isLastStep) {
      newRequestStatus = 'CEO_APPROVED'
      notifType        = 'APPROVAL_APPROVED'
      notifTitle       = `✅ อนุมัติเสร็จสิ้น: ${request.title}`
    } else {
      // Advance to next step
      newRequestStatus = `STEP_${activeStep.stepOrder}_APPROVED`
      notifType        = 'APPROVAL_APPROVED'
      notifTitle       = `✅ ผ่านขั้นตอน ${activeStep.stepOrder}: ${request.title}`
    }
  }

  // Update step
  await prisma.approvalRequestStep.update({
    where: { id: activeStep.id },
    data:  { status: newStepStatus, actorId: userId, comment: comment ?? null, ip, actedAt: new Date() },
  })

  // Activate next step if approved and not last
  const isLastStep = activeStep.stepOrder >= request.totalSteps
  if (action === 'APPROVE' && !isLastStep) {
    const nextStep = request.steps.find((s) => s.stepOrder === activeStep.stepOrder + 1)
    if (nextStep) {
      await prisma.approvalRequestStep.update({
        where: { id: nextStep.id },
        data:  { status: 'PENDING' },
      })
      // Notify next step approver
      if (nextStep.approverId) {
        await createNotification({
          userId: nextStep.approverId,
          type:   'APPROVAL_REQUESTED',
          title:  `รอการอนุมัติขั้น ${nextStep.stepOrder}: ${request.title}`,
          message: nextStep.stepName,
          link:   '/approvals',
        })
      } else if (nextStep.approverRole) {
        const approvers = await prisma.user.findMany({
          where: { role: nextStep.approverRole as never, status: 'ACTIVE' },
          select: { id: true },
        })
        if (approvers.length > 0) {
          await prisma.notification.createMany({
            data: approvers.map((u) => ({
              userId:  u.id,
              type:    'APPROVAL_REQUESTED' as const,
              title:   `รอการอนุมัติขั้น ${nextStep.stepOrder}: ${request.title}`,
              message: nextStep.stepName,
              link:    '/approvals',
            })),
          })
        }
      }
    }
  }

  // Determine final status for approval_requests
  const finalStatus = action === 'APPROVE' && !isLastStep
    ? 'IN_REVIEW'
    : newRequestStatus

  await prisma.approvalRequest.update({
    where: { id },
    data:  {
      status:      finalStatus,
      currentStep: action === 'APPROVE' && !isLastStep
        ? activeStep.stepOrder + 1
        : activeStep.stepOrder,
    },
  })

  // Write activity log
  await prisma.activityLog.create({
    data: {
      actorId:     userId,
      actorName:   session.user.name ?? '',
      docType:     request.docType,
      docId:       request.docId,
      docRef:      request.docRef ?? null,
      action,
      detail:      comment ?? `${action} ขั้นตอน ${activeStep.stepOrder}: ${activeStep.stepName}`,
      beforeValue: JSON.stringify({ status: request.status }),
      afterValue:  JSON.stringify({ status: finalStatus }),
      ip,
    },
  })

  // Notify requester
  await createNotification({
    userId:  request.requestedBy.id,
    type:    notifType,
    title:   notifTitle,
    message: comment ?? '',
    link:    '/approvals',
  })

  return NextResponse.json({ success: true, status: finalStatus })
}
