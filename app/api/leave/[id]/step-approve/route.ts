import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { canUserActOnStep, advanceLeaveChain, rejectLeaveChain } from '@/lib/approval-chain'
import { createAuditLog } from '@/lib/notifications'
import type { Role } from '@prisma/client'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: actorId, role } = session.user
    const { id: leaveId } = await params

    const body = (await req.json()) as {
      action: 'APPROVE' | 'REJECT'
      comment?: string
    }

    if (!['APPROVE', 'REJECT'].includes(body.action)) {
      return NextResponse.json({ error: 'action ต้องเป็น APPROVE หรือ REJECT' }, { status: 400 })
    }

    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'

    // Load leave + current step
    const leave = await prisma.leaveRequest.findUnique({
      where: { id: leaveId },
      select: { id: true, status: true, chainConfigId: true, currentStepOrder: true, userId: true },
    })

    if (!leave) return NextResponse.json({ error: 'ไม่พบคำขอลา' }, { status: 404 })
    if (!leave.chainConfigId) {
      return NextResponse.json({ error: 'คำขอนี้ไม่ได้ใช้ระบบ approval chain' }, { status: 400 })
    }
    if (leave.status === 'APPROVED' || leave.status === 'REJECTED') {
      return NextResponse.json({ error: 'คำขอนี้ดำเนินการเสร็จสิ้นแล้ว' }, { status: 400 })
    }

    // Find the current active step
    const currentStep = await prisma.leaveApprovalStep.findFirst({
      where: {
        leaveRequestId: leaveId,
        stepOrder: leave.currentStepOrder,
        status: 'PENDING',
      },
    })

    if (!currentStep) {
      return NextResponse.json({ error: 'ไม่พบขั้นตอนที่รออนุมัติ' }, { status: 400 })
    }

    // Permission check
    if (!canUserActOnStep(
      { id: currentStep.id, stepOrder: currentStep.stepOrder, stepName: currentStep.stepName, approverRole: currentStep.approverRole, approverId: currentStep.approverId, canSkip: false },
      actorId,
      role as Role,
    )) {
      return NextResponse.json(
        { error: `คุณไม่มีสิทธิ์อนุมัติขั้นนี้ (ต้องการ: ${currentStep.approverRole ?? 'approver ที่กำหนด'})` },
        { status: 403 },
      )
    }

    // Mark the step
    await prisma.leaveApprovalStep.update({
      where: { id: currentStep.id },
      data: {
        status:  body.action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        actorId,
        comment: body.comment?.trim() || null,
        ip,
        actedAt: new Date(),
      },
    })

    // Audit log
    await createAuditLog({
      actorId,
      targetId:   leaveId,
      targetType: 'LeaveRequest',
      action:     body.action === 'APPROVE' ? 'APPROVE' : 'REJECT',
      before:     { step: currentStep.stepOrder, stepName: currentStep.stepName },
      after:      { action: body.action, comment: body.comment },
      ip,
    })

    // Advance or reject chain
    if (body.action === 'APPROVE') {
      const { finalized, nextStepOrder } = await advanceLeaveChain(prisma, leaveId)
      return NextResponse.json({
        success: true,
        action: 'APPROVE',
        finalized,
        nextStepOrder,
        stepName: currentStep.stepName,
      })
    } else {
      await rejectLeaveChain(prisma, leaveId, currentStep.id, actorId, body.comment ?? '', ip)
      return NextResponse.json({
        success: true,
        action: 'REJECT',
        finalized: true,
        stepName: currentStep.stepName,
      })
    }
  } catch (err) {
    return apiError(err)
  }
}
