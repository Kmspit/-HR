import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNotification, sendLineNotify, createAuditLog } from '@/lib/notifications'
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
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, id: actorId } = session.user

  // Base check: leave + weekly plan require ADMIN or MANAGER_HR
  // Outside work: any role with approve_outside_work permission (checked inside handler)
  const isHrAdmin = role === 'ADMIN' || role === 'MANAGER_HR' || role === 'HR' || role === 'SUPER_ADMIN'
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

  // ── WEEKLY PLAN ──────────────────────────────────────
  if (body.type === 'WEEKLY_PLAN') {
    if (!isHrAdmin) return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    const plan = await prisma.weeklyLawyerPlan.findUnique({ where: { id: body.requestId } })
    if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (step === 1 && plan.status !== 'PENDING') {
      return NextResponse.json({ error: 'แผนงานนี้ไม่อยู่ในขั้นตอน Admin แล้ว' }, { status: 400 })
    }
    if (step === 2 && plan.status !== 'ADMIN_APPROVED') {
      return NextResponse.json({ error: 'ต้องให้ Admin อนุมัติก่อน' }, { status: 400 })
    }

    const newStatus = body.action === 'REJECT' ? 'REJECTED' : step === 1 ? 'ADMIN_APPROVED' : 'APPROVED'
    await prisma.weeklyLawyerPlan.update({ where: { id: body.requestId }, data: { status: newStatus } })
    await prisma.approvalHistory.create({ data: { approvedById: actorId, action: body.action, reason: body.reason, step, ip, weeklyPlanId: body.requestId } })

    await runNotify(() => createNotification({ userId: plan.lawyerId, type: newStatus === 'APPROVED' ? 'WEEKLY_PLAN_APPROVED' : 'OUTSIDE_REJECTED', title: newStatus === 'APPROVED' ? '✅ แผนงานสัปดาห์ได้รับการอนุมัติ' : '❌ แผนงานสัปดาห์ถูกปฏิเสธ', message: body.reason ?? '', link: '/weekly-plan' }))
    await runNotify(() => sendLineNotify(`\n🔔 [เค เอ็ม เซอร์วิส พลัส] แผนทนาย: ${newStatus}`))

    return NextResponse.json({ success: true, newStatus })
  }

  return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
  } catch (err) {
    return apiError(err)
  }
}
