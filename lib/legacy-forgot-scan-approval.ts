import type { PrismaClient } from '@prisma/client'
import type { Role } from '@prisma/client'
import { createAuditLog, createNotification } from '@/lib/notifications'
import { applyToAttendance, APPLY_ATTENDANCE_FAILED_MSG } from '@/lib/forgot-scan-chain'
import { canApproverActOnRequester, isCompanyWideApprover } from '@/lib/org-scope'

const SUPERVISOR_ROLES: Role[] = ['MANAGER', 'TEAM_LEADER', 'MANAGER_HR', 'ADMIN', 'SUPER_ADMIN', 'CEO']
const HR_ROLES: Role[] = ['HR', 'MANAGER_HR', 'ADMIN', 'SUPER_ADMIN', 'CEO']

const SCAN_TYPE_LABEL: Record<string, string> = {
  checkin: 'เข้างาน',
  'lunch-out': 'พักกลางวันออก',
  'lunch-in': 'กลับจากพัก',
  checkout: 'ออกงาน',
}

export async function executeLegacyForgotScanApproval(
  prisma: PrismaClient,
  id: string,
  actorId: string,
  role: Role,
  action: 'APPROVE' | 'REJECT',
  note: string | null,
  ip: string,
): Promise<{ success: true } | { error: string; status: number }> {
  const request = await prisma.forgotScanRequest.findUnique({ where: { id } })
  if (!request) return { error: 'ไม่พบคำขอ', status: 404 }

  if (request.chainConfigId) {
    return { error: 'คำขอนี้ใช้สายอนุมัติใหม่ — กรุณาอนุมัติที่ศูนย์อนุมัติ', status: 409 }
  }

  if (['APPROVED', 'REJECTED', 'ADMIN_REJECTED'].includes(request.status)) {
    return { error: 'คำขอนี้ดำเนินการเสร็จสิ้นแล้ว', status: 400 }
  }

  const isSupervisor = SUPERVISOR_ROLES.includes(role)
  const isHR = HR_ROLES.includes(role)
  const label = SCAN_TYPE_LABEL[request.scanType] ?? request.scanType

  if (request.status === 'PENDING') {
    if (!isSupervisor) {
      return { error: 'ต้องเป็นหัวหน้างานหรือผู้จัดการจึงจะอนุมัติขั้นนี้ได้', status: 403 }
    }
    if (!isCompanyWideApprover(role)) {
      const scoped = await canApproverActOnRequester(prisma, actorId, role, request.userId)
      if (!scoped) {
        return { error: 'ไม่มีสิทธิ์อนุมัติคำขอของพนักงานคนนี้', status: 403 }
      }
    }
    if (action === 'APPROVE') {
      await prisma.forgotScanRequest.update({
        where: { id },
        data: {
          status: 'ADMIN_APPROVED',
          supervisorId: actorId,
          supervisorNote: note,
          supervisorAt: new Date(),
        },
      })
      await createNotification({
        userId: request.userId,
        type: 'FORGOT_SCAN_APPROVED',
        title: 'หัวหน้าอนุมัติแล้ว — รอ HR ยืนยัน',
        message: `คำขอแก้ไขเวลา${label}ผ่านการอนุมัติจากหัวหน้าแล้ว กำลังรอ HR อนุมัติขั้นสุดท้าย`,
        link: '/approvals',
      })
    } else {
      await prisma.forgotScanRequest.update({
        where: { id },
        data: {
          status: 'REJECTED',
          supervisorId: actorId,
          supervisorNote: note,
          supervisorAt: new Date(),
        },
      })
      await createNotification({
        userId: request.userId,
        type: 'FORGOT_SCAN_REJECTED',
        title: 'คำขอแก้ไขเวลาถูกปฏิเสธ',
        message: `หัวหน้าปฏิเสธคำขอแก้ไขเวลา${label}${note ? `: ${note}` : ''}`,
        link: '/forgot-scan',
      })
    }
  } else if (request.status === 'ADMIN_APPROVED') {
    if (!isHR) {
      return { error: 'ต้องเป็น HR จึงจะอนุมัติขั้นสุดท้ายได้', status: 403 }
    }
    if (action === 'APPROVE') {
      const applied = await applyToAttendance(id, prisma, { actorId })
      if (!applied) {
        return { error: APPLY_ATTENDANCE_FAILED_MSG, status: 422 }
      }
      await prisma.forgotScanRequest.update({
        where: { id },
        data: { status: 'APPROVED', hrId: actorId, hrNote: note, hrAt: new Date() },
      })
      await createNotification({
        userId: request.userId,
        type: 'FORGOT_SCAN_APPROVED',
        title: 'คำขอแก้ไขเวลาได้รับอนุมัติ',
        message: `HR อนุมัติแล้ว — ระบบได้อัปเดตเวลา${label}ของคุณเรียบร้อย`,
        link: '/attendance',
      })
    } else {
      await prisma.forgotScanRequest.update({
        where: { id },
        data: { status: 'ADMIN_REJECTED', hrId: actorId, hrNote: note, hrAt: new Date() },
      })
      await createNotification({
        userId: request.userId,
        type: 'FORGOT_SCAN_REJECTED',
        title: 'HR ปฏิเสธคำขอแก้ไขเวลา',
        message: `HR ปฏิเสธคำขอแก้ไขเวลา${label}${note ? `: ${note}` : ''}`,
        link: '/forgot-scan',
      })
    }
  } else {
    return { error: 'สถานะคำขอไม่รองรับการอนุมัติ', status: 400 }
  }

  await createAuditLog({
    actorId,
    targetId: id,
    targetType: 'ForgotScanRequest',
    action: action === 'APPROVE' ? 'APPROVE' : 'REJECT',
    before: { status: request.status },
    after: { action, note },
    ip,
  })

  return { success: true }
}
