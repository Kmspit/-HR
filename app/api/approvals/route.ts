import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNotification, notifyRole, sendLineNotify, createAuditLog } from '@/lib/notifications'
import { ensureDbSchema } from '@/lib/ensure-db-schema'
import { headers } from 'next/headers'
import { apiError, runNotify } from '@/lib/api-handler'
import { executeLeaveStepAction, executeOutsideWorkStepAction } from '@/lib/approval-chain'
import type { Role } from '@prisma/client'

type ApprovalBody = {
  type: 'LEAVE' | 'OUTSIDE' | 'WEEKLY_PLAN'
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

  // Outside work: any role with approve_outside_work permission (checked inside chain handler)
  const isHrAdmin = role === 'ADMIN' || role === 'CEO' || role === 'MANAGER_HR' || role === 'HR' || role === 'SUPER_ADMIN'

  const body: ApprovalBody = await req.json()
  const ip = (await headers()).get('x-forwarded-for') ?? 'unknown'

  // ── LEAVE REQUEST (chain only) ──────────────────────────
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

  // ── OUTSIDE WORK (chain only) ─────────────────────────
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

  // ── WEEKLY PLAN — 2-step: MANAGER_HR = หัวหน้างาน (Step 1), ADMIN = ผู้บริหาร (Step 2) ──
  if (body.type === 'WEEKLY_PLAN') {
    if (!isHrAdmin) return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    const plan = await prisma.weeklyLawyerPlan.findUnique({ where: { id: body.requestId } })
    if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const approvalStatus = plan.approvalStatus

    // ── CEO — Final approver, bypasses all steps ──
    if (role === 'CEO') {
      const canAct = approvalStatus === 'pending_supervisor' || approvalStatus === 'pending_executive' ||
        (approvalStatus === null && (plan.status === 'PENDING' || plan.status === 'ADMIN_APPROVED'))
      if (!canAct) {
        return NextResponse.json({ error: 'แผนงานนี้ดำเนินการเสร็จสิ้นแล้ว' }, { status: 400 })
      }
      if (body.action === 'REJECT') {
        await prisma.weeklyLawyerPlan.update({
          where: { id: body.requestId },
          data: { status: 'REJECTED', approvalStatus: 'rejected_by_executive', executiveComment: body.reason ?? null },
        })
        await prisma.approvalHistory.create({ data: { approvedById: actorId, action: 'REJECT', reason: body.reason, step: 2, ip, weeklyPlanId: body.requestId } })
        await runNotify(() => createNotification({ userId: plan.lawyerId, type: 'WEEKLY_PLAN_REJECTED', title: '❌ แผนงานสัปดาห์ถูกปฏิเสธโดยผู้บริหาร', message: body.reason ?? '', link: '/weekly-plan' }))
        await runNotify(() => sendLineNotify(`\n🔔 [เค เอ็ม เซอร์วิส พลัส] แผนทนาย: ผู้บริหารไม่อนุมัติ`))
        return NextResponse.json({ success: true, newStatus: 'rejected_by_executive' })
      }
      await prisma.weeklyLawyerPlan.update({
        where: { id: body.requestId },
        data: { status: 'APPROVED', approvalStatus: 'approved', executiveComment: body.reason ?? null },
      })
      await prisma.approvalHistory.create({ data: { approvedById: actorId, action: 'APPROVE', reason: body.reason, step: 2, ip, weeklyPlanId: body.requestId } })
      await runNotify(() => createNotification({ userId: plan.lawyerId, type: 'WEEKLY_PLAN_APPROVED', title: '✅ แผนงานสัปดาห์ได้รับการอนุมัติสมบูรณ์', message: body.reason ?? '', link: '/weekly-plan' }))
      await runNotify(() => sendLineNotify(`\n🔔 [เค เอ็ม เซอร์วิส พลัส] แผนทนาย: ผู้บริหารอนุมัติสมบูรณ์แล้ว`))
      return NextResponse.json({ success: true, newStatus: 'approved' })
    }

    // ── หัวหน้างาน (MANAGER_HR / HR / SUPER_ADMIN) — Step 1 ──
    if (role === 'MANAGER_HR' || role === 'HR' || role === 'SUPER_ADMIN') {
      const isStep1 = approvalStatus === 'pending_supervisor' ||
        (approvalStatus === null && plan.status === 'PENDING')
      if (!isStep1) {
        return NextResponse.json({ error: 'แผนงานนี้ไม่อยู่ในขั้นตอนหัวหน้างานแล้ว' }, { status: 400 })
      }

      if (body.action === 'REJECT') {
        await prisma.weeklyLawyerPlan.update({
          where: { id: body.requestId },
          data: { status: 'REJECTED', approvalStatus: 'rejected_by_supervisor', supervisorComment: body.reason ?? null },
        })
        await prisma.approvalHistory.create({ data: { approvedById: actorId, action: 'REJECT', reason: body.reason, step: 1, ip, weeklyPlanId: body.requestId } })
        await runNotify(() => createNotification({ userId: plan.lawyerId, type: 'WEEKLY_PLAN_REJECTED', title: '❌ แผนงานสัปดาห์ถูกปฏิเสธโดยหัวหน้างาน', message: body.reason ?? '', link: '/weekly-plan' }))
        await runNotify(() => sendLineNotify(`\n🔔 [เค เอ็ม เซอร์วิส พลัส] แผนทนาย: หัวหน้างานไม่อนุมัติ`))
        return NextResponse.json({ success: true, newStatus: 'rejected_by_supervisor' })
      }

      // Approve → forward to ผู้บริหาร
      await prisma.weeklyLawyerPlan.update({
        where: { id: body.requestId },
        data: { status: 'ADMIN_APPROVED', approvalStatus: 'pending_executive', supervisorComment: body.reason ?? null },
      })
      await prisma.approvalHistory.create({ data: { approvedById: actorId, action: 'APPROVE', reason: body.reason, step: 1, ip, weeklyPlanId: body.requestId } })
      await runNotify(() => notifyRole('ADMIN', 'OUTSIDE_REQUEST', '📋 แผนงานทนายรอผู้บริหารอนุมัติ', 'หัวหน้างานอนุมัติแล้ว — รออนุมัติขั้นสุดท้าย', '/approvals'))
      await runNotify(() => notifyRole('CEO', 'OUTSIDE_REQUEST', '📋 แผนงานทนายรอผู้บริหารอนุมัติ', 'หัวหน้างานอนุมัติแล้ว — รออนุมัติขั้นสุดท้าย', '/approvals'))
      await runNotify(() => sendLineNotify(`\n🔔 [เค เอ็ม เซอร์วิส พลัส] แผนทนาย: หัวหน้างานอนุมัติแล้ว รอผู้บริหาร`))
      return NextResponse.json({ success: true, newStatus: 'pending_executive' })
    }

    // ── ผู้บริหาร (ADMIN) — Step 2 ──
    if (role === 'ADMIN') {
      const isStep2 = approvalStatus === 'pending_executive' ||
        (approvalStatus === null && plan.status === 'ADMIN_APPROVED')
      if (!isStep2) {
        return NextResponse.json({ error: 'ต้องให้หัวหน้างานอนุมัติก่อน', code: 'SUPERVISOR_APPROVAL_REQUIRED' }, { status: 400 })
      }

      if (body.action === 'REJECT') {
        await prisma.weeklyLawyerPlan.update({
          where: { id: body.requestId },
          data: { status: 'REJECTED', approvalStatus: 'rejected_by_executive', executiveComment: body.reason ?? null },
        })
        await prisma.approvalHistory.create({ data: { approvedById: actorId, action: 'REJECT', reason: body.reason, step: 2, ip, weeklyPlanId: body.requestId } })
        await runNotify(() => createNotification({ userId: plan.lawyerId, type: 'WEEKLY_PLAN_REJECTED', title: '❌ แผนงานสัปดาห์ถูกปฏิเสธโดยผู้บริหาร', message: body.reason ?? '', link: '/weekly-plan' }))
        await runNotify(() => sendLineNotify(`\n🔔 [เค เอ็ม เซอร์วิส พลัส] แผนทนาย: ผู้บริหารไม่อนุมัติ`))
        return NextResponse.json({ success: true, newStatus: 'rejected_by_executive' })
      }

      // Final approve
      await prisma.weeklyLawyerPlan.update({
        where: { id: body.requestId },
        data: { status: 'APPROVED', approvalStatus: 'approved', executiveComment: body.reason ?? null },
      })
      await prisma.approvalHistory.create({ data: { approvedById: actorId, action: 'APPROVE', reason: body.reason, step: 2, ip, weeklyPlanId: body.requestId } })
      await runNotify(() => createNotification({ userId: plan.lawyerId, type: 'WEEKLY_PLAN_APPROVED', title: '✅ แผนงานสัปดาห์ได้รับการอนุมัติสมบูรณ์', message: body.reason ?? '', link: '/weekly-plan' }))
      await runNotify(() => sendLineNotify(`\n🔔 [เค เอ็ม เซอร์วิส พลัส] แผนทนาย: ผู้บริหารอนุมัติสมบูรณ์แล้ว`))
      return NextResponse.json({ success: true, newStatus: 'approved' })
    }

    return NextResponse.json({ error: 'ไม่มีสิทธิ์อนุมัติแผนงาน' }, { status: 403 })
  }

  return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
  } catch (err) {
    return apiError(err)
  }
}
