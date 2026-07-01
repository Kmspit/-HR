import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/notifications'
import { ensureDbSchema } from '@/lib/ensure-db-schema'
import { headers } from 'next/headers'
import { apiError, runNotify } from '@/lib/api-handler'
import { executeLeaveStepAction, executeOutsideWorkStepAction } from '@/lib/approval-chain'
import { executeWeeklyPlanStepAction } from '@/lib/weekly-plan-chain'
import { executeForgotScanStepAction } from '@/lib/forgot-scan-chain'
import { executeLegacyForgotScanApproval } from '@/lib/legacy-forgot-scan-approval'
import type { Role } from '@prisma/client'

type ApprovalBody = {
  type: 'LEAVE' | 'OUTSIDE' | 'WEEKLY_PLAN' | 'FORGOT_SCAN'
  requestId: string
  action: 'APPROVE' | 'REJECT'
  reason?: string
}

export async function POST(req: NextRequest) {
  try {
    await ensureDbSchema().catch(() => {})
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, id: actorId } = session.user
    const body: ApprovalBody = await req.json()
    const ip = (await headers()).get('x-forwarded-for') ?? 'unknown'

    if (body.type === 'LEAVE') {
      const leave = await prisma.leaveRequest.findUnique({ where: { id: body.requestId } })
      if (!leave) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (!leave.chainConfigId) {
        return NextResponse.json(
          { error: 'คำขอนี้ยังไม่ได้เชื่อมสายอนุมัติ — กรุณาติดต่อ HR', code: 'NO_CHAIN' },
          { status: 409 },
        )
      }
      const chainResult = await executeLeaveStepAction(
        prisma, body.requestId, actorId, role as Role, body.action, body.reason, ip,
      )
      if ('error' in chainResult) {
        return NextResponse.json({ error: chainResult.error }, { status: chainResult.status })
      }
      await runNotify(() => createAuditLog({
        actorId, targetId: body.requestId, targetType: 'LeaveRequest',
        action: body.action === 'APPROVE' ? 'APPROVE' : 'REJECT',
        after: { stepName: chainResult.stepName, finalized: chainResult.finalized },
        ip,
      }))
      return NextResponse.json({ ...chainResult })
    }

    if (body.type === 'OUTSIDE') {
      const req_ = await prisma.outsideWorkRequest.findUnique({ where: { id: body.requestId } })
      if (!req_) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (req_.status === 'APPROVED' || req_.status === 'REJECTED') {
        return NextResponse.json({ error: 'คำขอนี้ดำเนินการเสร็จสิ้นแล้ว' }, { status: 400 })
      }
      if (!req_.chainConfigId || req_.approvalStatus !== 'pending_chain') {
        return NextResponse.json(
          { error: 'คำขอนี้ยังไม่ได้เชื่อมสายอนุมัติ — กรุณาติดต่อ HR', code: 'NO_CHAIN' },
          { status: 409 },
        )
      }
      const chainResult = await executeOutsideWorkStepAction(
        prisma, body.requestId, actorId, role as Role, body.action, body.reason, ip,
      )
      if ('error' in chainResult) {
        return NextResponse.json({ error: chainResult.error }, { status: chainResult.status })
      }
      await prisma.approvalHistory.create({
        data: {
          approvedById: actorId,
          action: body.action,
          reason: body.reason,
          step: req_.currentStepOrder,
          ip,
          outsideRequestId: body.requestId,
        },
      })
      await runNotify(() => createAuditLog({
        actorId, targetId: body.requestId, targetType: 'OutsideWorkRequest',
        action: body.action === 'APPROVE' ? 'APPROVE' : 'REJECT',
        after: { stepName: chainResult.stepName, finalized: chainResult.finalized },
        ip,
      }))
      return NextResponse.json({ ...chainResult })
    }

    if (body.type === 'WEEKLY_PLAN') {
      const plan = await prisma.weeklyLawyerPlan.findUnique({ where: { id: body.requestId } })
      if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (!plan.chainConfigId) {
        return NextResponse.json(
          { error: 'แผนงานยังไม่ได้เชื่อมสายอนุมัติ — กรุณาติดต่อ HR', code: 'NO_CHAIN' },
          { status: 409 },
        )
      }
      const chainResult = await executeWeeklyPlanStepAction(
        prisma, body.requestId, actorId, role as Role, body.action, body.reason, ip,
      )
      if ('error' in chainResult) {
        return NextResponse.json({ error: chainResult.error }, { status: chainResult.status })
      }
      await prisma.approvalHistory.create({
        data: {
          approvedById: actorId,
          action: body.action,
          reason: body.reason,
          step: plan.currentStepOrder,
          ip,
          weeklyPlanId: body.requestId,
        },
      })
      await runNotify(() => createAuditLog({
        actorId, targetId: body.requestId, targetType: 'WeeklyLawyerPlan',
        action: body.action === 'APPROVE' ? 'APPROVE' : 'REJECT',
        after: { stepName: chainResult.stepName, finalized: chainResult.finalized },
        ip,
      }))
      return NextResponse.json({ ...chainResult })
    }

    if (body.type === 'FORGOT_SCAN') {
      const fs = await prisma.forgotScanRequest.findUnique({ where: { id: body.requestId } })
      if (!fs) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (!fs.chainConfigId) {
        const legacy = await executeLegacyForgotScanApproval(
          prisma,
          body.requestId,
          actorId,
          role as Role,
          body.action,
          body.reason?.trim() || null,
          ip,
        )
        if ('error' in legacy) {
          return NextResponse.json({ error: legacy.error }, { status: legacy.status })
        }
        return NextResponse.json({ success: true, legacy: true })
      }
      const chainResult = await executeForgotScanStepAction(
        prisma, body.requestId, actorId, role as Role, body.action, body.reason, ip,
      )
      if ('error' in chainResult) {
        return NextResponse.json({ error: chainResult.error }, { status: chainResult.status })
      }
      await runNotify(() => createAuditLog({
        actorId, targetId: body.requestId, targetType: 'ForgotScanRequest',
        action: body.action === 'APPROVE' ? 'APPROVE' : 'REJECT',
        after: { stepName: chainResult.stepName, finalized: chainResult.finalized },
        ip,
      }))
      return NextResponse.json({ ...chainResult })
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
  } catch (err) {
    return apiError(err)
  }
}
