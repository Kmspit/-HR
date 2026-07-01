import type { PrismaClient, Role } from '@prisma/client'
import { createAuditLog, createNotification } from '@/lib/notifications'
import { canApproverActOnRequester, isCompanyWideApprover } from '@/lib/org-scope'
import { hasPermission } from '@/lib/access-control'

const SUPERVISOR_ROLES: Role[] = ['MANAGER', 'TEAM_LEADER', 'MANAGER_HR', 'ADMIN', 'SUPER_ADMIN', 'CEO']
const HR_ROLES: Role[] = ['HR', 'MANAGER_HR', 'ADMIN', 'SUPER_ADMIN', 'CEO']

export async function executeLegacyLeaveApproval(
  prisma: PrismaClient,
  id: string,
  actorId: string,
  role: Role,
  action: 'APPROVE' | 'REJECT',
  note: string | null,
  ip: string,
): Promise<{ success: true; finalized: boolean } | { error: string; status: number }> {
  const leave = await prisma.leaveRequest.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true } } },
  })
  if (!leave) return { error: 'ไม่พบคำขอ', status: 404 }
  if (leave.chainConfigId) {
    return { error: 'คำขอนี้ใช้สายอนุมัติใหม่ — กรุณาอนุมัติที่ศูนย์อนุมัติ', status: 409 }
  }
  if (['APPROVED', 'REJECTED'].includes(leave.status)) {
    return { error: 'คำขอนี้ดำเนินการเสร็จสิ้นแล้ว', status: 400 }
  }

  const isSupervisor = SUPERVISOR_ROLES.includes(role) && hasPermission(role, 'approve_leave')
  const isHR = HR_ROLES.includes(role) && hasPermission(role, 'approve_leave')

  if (leave.status === 'PENDING') {
    if (!isSupervisor) {
      return { error: 'ต้องเป็นหัวหน้างานหรือผู้จัดการจึงจะอนุมัติขั้นนี้ได้', status: 403 }
    }
    if (!isCompanyWideApprover(role)) {
      const scoped = await canApproverActOnRequester(prisma, actorId, role, leave.userId)
      if (!scoped) return { error: 'ไม่มีสิทธิ์อนุมัติคำขอของพนักงานคนนี้', status: 403 }
    }
    if (action === 'APPROVE') {
      await prisma.leaveRequest.update({
        where: { id },
        data: { status: 'ADMIN_APPROVED' },
      })
      await createNotification({
        userId: leave.userId,
        type: 'LEAVE_APPROVED',
        title: 'หัวหน้าอนุมัติแล้ว — รอ HR ยืนยัน',
        message: `คำขอล ${leave.days} วันผ่านการอนุมัติจากหัวหน้าแล้ว กำลังรอ HR อนุมัติขั้นสุดท้าย`,
        link: '/approval-center',
      })
    } else {
      await prisma.leaveRequest.update({
        where: { id },
        data: { status: 'REJECTED' },
      })
      await createNotification({
        userId: leave.userId,
        type: 'LEAVE_REJECTED',
        title: 'คำขอลาถูกปฏิเสธ',
        message: note ? `เหตุผล: ${note}` : 'คำขอลาของคุณถูกปฏิเสธ',
        link: '/leave',
      })
    }
    await createAuditLog({
      actorId,
      targetId: id,
      targetType: 'LeaveRequest',
      action: action === 'APPROVE' ? 'APPROVE' : 'REJECT',
      after: { legacy: true, step: 'supervisor' },
      ip,
    })
    return { success: true, finalized: action === 'REJECT' }
  }

  if (leave.status === 'ADMIN_APPROVED') {
    if (!isHR) {
      return { error: 'ต้องเป็น HR จึงจะอนุมัติขั้นสุดท้ายได้', status: 403 }
    }
    if (action === 'APPROVE') {
      await prisma.leaveRequest.update({
        where: { id },
        data: { status: 'APPROVED' },
      })
      await createNotification({
        userId: leave.userId,
        type: 'LEAVE_APPROVED',
        title: 'อนุมัติลาแล้ว',
        message: `คำขอล ${leave.days} วันได้รับการอนุมัติแล้ว`,
        link: '/leave',
      })
    } else {
      await prisma.leaveRequest.update({
        where: { id },
        data: { status: 'REJECTED' },
      })
      await createNotification({
        userId: leave.userId,
        type: 'LEAVE_REJECTED',
        title: 'คำขอลาถูกปฏิเสธ',
        message: note ? `เหตุผล: ${note}` : 'คำขอลาของคุณถูกปฏิเสธ',
        link: '/leave',
      })
    }
    await createAuditLog({
      actorId,
      targetId: id,
      targetType: 'LeaveRequest',
      action: action === 'APPROVE' ? 'APPROVE' : 'REJECT',
      after: { legacy: true, step: 'hr', finalized: true },
      ip,
    })
    return { success: true, finalized: true }
  }

  return { error: 'สถานะคำขอไม่รองรับการอนุมัติ legacy', status: 400 }
}

export async function executeLegacyOutsideApproval(
  prisma: PrismaClient,
  id: string,
  actorId: string,
  role: Role,
  action: 'APPROVE' | 'REJECT',
  note: string | null,
  ip: string,
): Promise<{ success: true; finalized: boolean } | { error: string; status: number }> {
  const request = await prisma.outsideWorkRequest.findUnique({ where: { id } })
  if (!request) return { error: 'ไม่พบคำขอ', status: 404 }
  if (request.chainConfigId) {
    return { error: 'คำขอนี้ใช้สายอนุมัติใหม่ — กรุณาอนุมัติที่ศูนย์อนุมัติ', status: 409 }
  }
  if (['APPROVED', 'REJECTED'].includes(request.status)) {
    return { error: 'คำขอนี้ดำเนินการเสร็จสิ้นแล้ว', status: 400 }
  }
  if (!hasPermission(role, 'approve_outside_work')) {
    return { error: 'ไม่มีสิทธิ์อนุมัติงานนอกสถานที่', status: 403 }
  }

  const isExec = ['CEO', 'SUPER_ADMIN', 'MANAGER_HR'].includes(role)

  if (request.approvalStatus === 'pending_ceo') {
    if (!isExec) return { error: 'ต้องเป็น CEO/ผู้บริหารจึงจะอนุมัติขั้นนี้ได้', status: 403 }
    if (action === 'APPROVE') {
      await prisma.outsideWorkRequest.update({
        where: { id },
        data: { status: 'APPROVED', approvalStatus: 'approved_by_ceo' },
      })
    } else {
      await prisma.outsideWorkRequest.update({
        where: { id },
        data: { status: 'REJECTED', approvalStatus: 'rejected_by_ceo' },
      })
    }
    await createAuditLog({
      actorId,
      targetId: id,
      targetType: 'OutsideWorkRequest',
      action: action === 'APPROVE' ? 'APPROVE' : 'REJECT',
      after: { legacy: true, step: 'ceo', finalized: true },
      ip,
    })
    return { success: true, finalized: true }
  }

  if (request.status === 'PENDING') {
    if (!isExec) {
      const scoped = await canApproverActOnRequester(prisma, actorId, role, request.userId)
      if (!scoped) return { error: 'ไม่มีสิทธิ์อนุมัติคำขอของพนักงานคนนี้', status: 403 }
    }
    if (action === 'APPROVE') {
      await prisma.outsideWorkRequest.update({
        where: { id },
        data: { approvalStatus: 'pending_ceo' },
      })
    } else {
      await prisma.outsideWorkRequest.update({
        where: { id },
        data: { status: 'REJECTED', approvalStatus: 'rejected' },
      })
    }
    await createAuditLog({
      actorId,
      targetId: id,
      targetType: 'OutsideWorkRequest',
      action: action === 'APPROVE' ? 'APPROVE' : 'REJECT',
      after: { legacy: true, step: 'supervisor', finalized: action === 'REJECT' },
      ip,
    })
    return { success: true, finalized: action === 'REJECT' }
  }

  return { error: 'สถานะคำขอไม่รองรับการอนุมัติ legacy', status: 400 }
}
