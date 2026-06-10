import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNotification, notifyRole, sendLineNotify, createAuditLog } from '@/lib/notifications'
import { ensureDbSchema } from '@/lib/ensure-db-schema'
import { headers } from 'next/headers'
import { apiError, runNotify } from '@/lib/api-handler'
import { hasPermission } from '@/lib/rbac'
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

  // Base check: leave + weekly plan require ADMIN or MANAGER_HR
  // Outside work: any role with approve_outside_work permission (checked inside handler)
  const isHrAdmin = role === 'ADMIN' || role === 'CEO' || role === 'MANAGER_HR' || role === 'HR' || role === 'SUPER_ADMIN'
  const canApproveOutside = hasPermission(role as Role, 'approve_outside_work')

  const body: ApprovalBody = await req.json()
  const ip = (await headers()).get('x-forwarded-for') ?? 'unknown'

  // Determine step: Admin = step 1, Manager/HR = step 2
  const step = role === 'ADMIN' ? 1 : 2

  // ── LEAVE REQUEST ─────────────────────────────────────
  if (body.type === 'LEAVE') {
    if (!isHrAdmin) return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    const leave = await prisma.leaveRequest.findUnique({ where: { id: body.requestId } })
    if (!leave) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // CEO bypasses steps — direct final approval from any pending state
    if (role === 'CEO') {
      if (leave.status !== 'PENDING' && leave.status !== 'ADMIN_APPROVED') {
        return NextResponse.json({ error: 'คำขอนี้ดำเนินการเสร็จสิ้นแล้ว' }, { status: 400 })
      }
      const ceoStatus = body.action === 'REJECT' ? 'REJECTED' : 'APPROVED'
      await prisma.leaveRequest.update({ where: { id: body.requestId }, data: { status: ceoStatus } })
      await prisma.approvalHistory.create({ data: { approvedById: actorId, action: body.action, reason: body.reason, step: 2, ip, leaveRequestId: body.requestId } })
      await runNotify(() => createAuditLog({ actorId, targetId: body.requestId, targetType: 'LeaveRequest', action: body.action === 'APPROVE' ? 'APPROVE' : 'REJECT', before: { status: leave.status }, after: { status: ceoStatus }, ip }))
      const ceoNotifType  = ceoStatus === 'APPROVED' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED'
      const ceoNotifTitle = ceoStatus === 'APPROVED' ? '✅ คำขอลาได้รับการอนุมัติ' : '❌ คำขอลาถูกปฏิเสธ'
      await runNotify(() => createNotification({ userId: leave.userId, type: ceoNotifType, title: ceoNotifTitle, message: body.reason ?? '', link: '/leave' }))
      await runNotify(() => sendLineNotify(`\n🔔 [เค เอ็ม เซอร์วิส พลัส] การลา: ${ceoNotifTitle}\nรหัสคำขอ: ${body.requestId}${body.reason ? `\nเหตุผล: ${body.reason}` : ''}`))
      return NextResponse.json({ success: true, newStatus: ceoStatus })
    }

    // Admin can only approve step 1 (PENDING → ADMIN_APPROVED)
    if (step === 1 && leave.status !== 'PENDING') {
      return NextResponse.json({ error: 'Invalid status for step 1' }, { status: 400 })
    }
    // Manager can only approve step 2 (ADMIN_APPROVED → APPROVED)
    if (step === 2 && leave.status !== 'ADMIN_APPROVED') {
      return NextResponse.json({ error: 'Requires admin approval first' }, { status: 400 })
    }

    let newStatus: 'ADMIN_APPROVED' | 'APPROVED' | 'REJECTED'
    if (body.action === 'REJECT') {
      newStatus = 'REJECTED'
    } else if (step === 1) {
      newStatus = 'ADMIN_APPROVED'
    } else {
      newStatus = 'APPROVED'
    }

    await prisma.leaveRequest.update({ where: { id: body.requestId }, data: { status: newStatus } })

    await prisma.approvalHistory.create({
      data: {
        approvedById:  actorId,
        action:        body.action,
        reason:        body.reason,
        step,
        ip,
        leaveRequestId: body.requestId,
      },
    })

    await runNotify(() => createAuditLog({ actorId, targetId: body.requestId, targetType: 'LeaveRequest', action: body.action === 'APPROVE' ? 'APPROVE' : 'REJECT', before: { status: leave.status }, after: { status: newStatus }, ip }))

    // Notify employee
    const notifType  = newStatus === 'APPROVED' ? 'LEAVE_APPROVED' : newStatus === 'REJECTED' ? 'LEAVE_REJECTED' : 'LEAVE_REQUEST'
    const notifTitle = newStatus === 'APPROVED' ? '✅ คำขอลาได้รับการอนุมัติ' : newStatus === 'REJECTED' ? '❌ คำขอลาถูกปฏิเสธ' : '⏳ คำขอลาอยู่ระหว่างรอ Manager อนุมัติ'
    await runNotify(() => createNotification({ userId: leave.userId, type: notifType, title: notifTitle, message: body.reason ?? '', link: '/leave' }))

    // If admin approved → notify managers
    if (newStatus === 'ADMIN_APPROVED') {
      await runNotify(async () => {
        const managers = await prisma.user.findMany({ where: { role: 'MANAGER_HR', status: 'ACTIVE' }, select: { id: true } })
        if (managers.length > 0) {
          await prisma.notification.createMany({
            data: managers.map((m) => ({
              userId: m.id, type: 'LEAVE_REQUEST' as const,
              title: '📋 คำขอลาผ่าน Admin แล้ว รอ Final Approve',
              message: `คำขอลา ID: ${body.requestId} รอการอนุมัติขั้นสุดท้าย`,
              link: '/approvals',
            })),
          })
        }
      })
    }

    await runNotify(() =>
      sendLineNotify(`\n🔔 [เค เอ็ม เซอร์วิส พลัส] การลา: ${notifTitle}\nรหัสคำขอ: ${body.requestId}${body.reason ? `\nเหตุผล: ${body.reason}` : ''}`),
    )

    return NextResponse.json({ success: true, newStatus })
  }

  // ── OUTSIDE WORK ─────────────────────────────────────
  if (body.type === 'OUTSIDE') {
    if (!canApproveOutside) return NextResponse.json({ error: 'Permission denied' }, { status: 403 })

    const req_ = await prisma.outsideWorkRequest.findUnique({ where: { id: body.requestId } })
    if (!req_) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (req_.status === 'APPROVED' || req_.status === 'REJECTED') {
      return NextResponse.json({ error: 'คำขอนี้ดำเนินการเสร็จสิ้นแล้ว' }, { status: 400 })
    }

    // ── CEO-only flow for new outside work requests ──
    if ((req_ as Record<string, unknown>).approvalStatus === 'pending_ceo') {
      if (role !== 'CEO') {
        return NextResponse.json({ error: 'เฉพาะ CEO เท่านั้นที่อนุมัติคำขอนี้ได้', code: 'CEO_ONLY' }, { status: 403 })
      }
      const ceoDone = body.action === 'REJECT' ? 'REJECTED' : 'APPROVED'
      const ceoApprovalStatus = body.action === 'REJECT' ? 'rejected_by_ceo' : 'approved_by_ceo'
      await prisma.outsideWorkRequest.update({
        where: { id: body.requestId },
        data: { status: ceoDone, approvalStatus: ceoApprovalStatus } as Record<string, unknown>,
      })
      await prisma.approvalHistory.create({ data: { approvedById: actorId, action: body.action, reason: body.reason, step: 1, ip, outsideRequestId: body.requestId } })
      await runNotify(() => createAuditLog({ actorId, targetId: body.requestId, targetType: 'OutsideWorkRequest', action: body.action === 'APPROVE' ? 'APPROVE' : 'REJECT', before: { status: req_.status }, after: { status: ceoDone }, ip }))
      await runNotify(() => createNotification({
        userId: req_.userId,
        type: ceoDone === 'APPROVED' ? 'OUTSIDE_APPROVED' : 'OUTSIDE_REJECTED',
        title: ceoDone === 'APPROVED' ? '✅ CEO อนุมัติคำขอออกนอกสถานที่แล้ว' : '❌ CEO ปฏิเสธคำขอออกนอกสถานที่',
        message: body.reason ?? '',
        link: '/outside-work',
      }))
      await runNotify(() => sendLineNotify(`\n🔔 [เค เอ็ม เซอร์วิส พลัส] ออกนอกสถานที่: ${ceoDone === 'APPROVED' ? 'CEO อนุมัติแล้ว' : 'CEO ปฏิเสธ'}\nรหัสคำขอ: ${body.requestId}${body.reason ? `\nเหตุผล: ${body.reason}` : ''}`))
      return NextResponse.json({ success: true, newStatus: ceoDone })
    }

    // ── Legacy 2-step flow (backward compat for old records) ──
    let newStatus: 'ADMIN_APPROVED' | 'APPROVED' | 'REJECTED'
    if (body.action === 'REJECT') {
      newStatus = 'REJECTED'
    } else if (isHrAdmin && req_.status === 'PENDING') {
      // ADMIN/MANAGER_HR/HR ทำ step 1: PENDING → ADMIN_APPROVED (รอ final)
      newStatus = 'ADMIN_APPROVED'
    } else {
      // Final approval: ADMIN_APPROVED → APPROVED (หรือ MANAGER/TEAM_LEADER ทำ direct)
      newStatus = 'APPROVED'
    }

    await prisma.outsideWorkRequest.update({ where: { id: body.requestId }, data: { status: newStatus } })

    const approvalStep = req_.status === 'PENDING' ? 1 : 2
    await prisma.approvalHistory.create({
      data: {
        approvedById: actorId,
        action:       body.action,
        reason:       body.reason,
        step:         approvalStep,
        ip,
        outsideRequestId: body.requestId,
      },
    })

    await runNotify(() =>
      createAuditLog({
        actorId,
        targetId:   body.requestId,
        targetType: 'OutsideWorkRequest',
        action:     body.action === 'APPROVE' ? 'APPROVE' : 'REJECT',
        before:     { status: req_.status },
        after:      { status: newStatus },
        ip,
      }),
    )

    await runNotify(() =>
      createNotification({
        userId: req_.userId,
        type:    newStatus === 'APPROVED' ? 'OUTSIDE_APPROVED' : newStatus === 'REJECTED' ? 'OUTSIDE_REJECTED' : 'OUTSIDE_REQUEST',
        title:   newStatus === 'APPROVED' ? '✅ อนุมัติออกนอกสถานที่แล้ว' : newStatus === 'REJECTED' ? '❌ ปฏิเสธออกนอกสถานที่' : '⏳ คำขอออกนอกสถานที่รอ Final Approve',
        message: body.reason ?? '',
        link:    '/outside-work',
      }),
    )

    await runNotify(() =>
      sendLineNotify(
        `\n🔔 [เค เอ็ม เซอร์วิส พลัส] ออกนอกสถานที่: ${newStatus === 'APPROVED' ? 'อนุมัติแล้ว' : newStatus === 'REJECTED' ? 'ปฏิเสธ' : 'รอ Final'}`,
      ),
    )

    return NextResponse.json({ success: true, newStatus })
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
