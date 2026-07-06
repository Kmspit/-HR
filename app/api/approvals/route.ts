import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/notifications'
import { headers } from 'next/headers'
import { apiError, runNotify } from '@/lib/api-handler'
import { executeLeaveStepAction, executeOutsideWorkStepAction } from '@/lib/approval-chain'
import { executeWeeklyPlanStepAction } from '@/lib/weekly-plan-chain'
import { executeForgotScanStepAction } from '@/lib/forgot-scan-chain'
import {
  attachDefaultChainForForgotScan,
  attachDefaultChainForLeave,
  attachDefaultChainForOutside,
  attachDefaultChainForWeekly,
} from '@/lib/attach-default-chain'
import { canPerformApproval } from '@/lib/approval-permissions'
import { requireCsrf } from '@/lib/api-guard'
import type { Role } from '@prisma/client'

type ApprovalBody = {
  type: 'LEAVE' | 'OUTSIDE' | 'WEEKLY_PLAN' | 'FORGOT_SCAN'
  requestId: string
  action: 'APPROVE' | 'REJECT'
  reason?: string
}

export async function POST(req: NextRequest) {
  try {
    const csrfErr = requireCsrf(req)
    if (csrfErr) return csrfErr

    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, id: actorId } = session.user
    const body: ApprovalBody = await req.json()
    const ip = (await headers()).get('x-forwarded-for') ?? 'unknown'

    if (!body.type || !body.requestId || !body.action) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    if (!canPerformApproval(role as Role, body.type)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (body.type === 'LEAVE') {
      const leave = await prisma.leaveRequest.findUnique({ where: { id: body.requestId } })
      if (!leave) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (!leave.chainConfigId) {
        await attachDefaultChainForLeave(prisma, body.requestId, leave.userId)
      }
      const refreshed = await prisma.leaveRequest.findUnique({ where: { id: body.requestId } })
      if (!refreshed?.chainConfigId) {
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
      const req_ = await prisma.outsideWorkRequest.findUnique({
        where: { id: body.requestId, deletedAt: null },
        select: { status: true, chainConfigId: true, approvalStatus: true, userId: true },
      })
      if (!req_) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (req_.status === 'APPROVED' || req_.status === 'REJECTED') {
        return NextResponse.json({ error: 'คำขอนี้ดำเนินการเสร็จสิ้นแล้ว' }, { status: 400 })
      }
      if (!req_.chainConfigId || req_.approvalStatus !== 'pending_chain') {
        await attachDefaultChainForOutside(prisma, body.requestId, req_.userId)
      }
      const refreshed = await prisma.outsideWorkRequest.findUnique({
        where: { id: body.requestId, deletedAt: null },
        select: { chainConfigId: true, approvalStatus: true, currentStepOrder: true },
      })
      if (!refreshed?.chainConfigId || refreshed.approvalStatus !== 'pending_chain') {
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
          step: refreshed.currentStepOrder,
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
        await attachDefaultChainForWeekly(prisma, body.requestId, plan.lawyerId)
      }
      const refreshed = await prisma.weeklyLawyerPlan.findUnique({ where: { id: body.requestId } })
      if (!refreshed?.chainConfigId) {
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
          step: refreshed.currentStepOrder,
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
        await attachDefaultChainForForgotScan(prisma, body.requestId, fs.userId)
      }
      const refreshed = await prisma.forgotScanRequest.findUnique({ where: { id: body.requestId } })
      if (!refreshed?.chainConfigId) {
        return NextResponse.json(
          { error: 'คำขอนี้ยังไม่ได้เชื่อมสายอนุมัติ — กรุณาติดต่อ HR', code: 'NO_CHAIN' },
          { status: 409 },
        )
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
