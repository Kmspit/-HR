import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { createAuditLog, createNotification } from '@/lib/notifications'
import { applyToAttendance, APPLY_ATTENDANCE_FAILED_MSG } from '@/lib/forgot-scan-chain'
import type { Role } from '@prisma/client'

type Params = { params: Promise<{ id: string }> }

const SUPERVISOR_ROLES: Role[] = ['MANAGER', 'TEAM_LEADER', 'MANAGER_HR', 'ADMIN', 'SUPER_ADMIN']
const HR_ROLES: Role[] = ['HR', 'MANAGER_HR', 'ADMIN', 'SUPER_ADMIN']

const SCAN_TYPE_LABEL: Record<string, string> = {
  checkin:     'เข้างาน',
  'lunch-out': 'พักกลางวันออก',
  'lunch-in':  'กลับจากพัก',
  checkout:    'ออกงาน',
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: actorId, role } = session.user
    const { id } = await params
    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'

    const body = (await req.json()) as { action: 'APPROVE' | 'REJECT'; note?: string }
    if (!['APPROVE', 'REJECT'].includes(body.action)) {
      return NextResponse.json({ error: 'action ต้องเป็น APPROVE หรือ REJECT' }, { status: 400 })
    }

    const request = await prisma.forgotScanRequest.findUnique({ where: { id } })
    if (!request) return NextResponse.json({ error: 'ไม่พบคำขอ' }, { status: 404 })

    if (request.chainConfigId) {
      return NextResponse.json(
        { error: 'คำขอนี้ใช้สายอนุมัติใหม่ — กรุณาอนุมัติที่ศูนย์อนุมัติ', code: 'USE_CHAIN' },
        { status: 409 },
      )
    }

    if (['APPROVED', 'REJECTED', 'ADMIN_REJECTED'].includes(request.status)) {
      return NextResponse.json({ error: 'คำขอนี้ดำเนินการเสร็จสิ้นแล้ว' }, { status: 400 })
    }

    const note = body.note?.trim() || null
    const isSupervisor = SUPERVISOR_ROLES.includes(role as Role)
    const isHR = HR_ROLES.includes(role as Role)
    const label = SCAN_TYPE_LABEL[request.scanType] ?? request.scanType

    // ── Step 1: Supervisor approves PENDING ──────────────────────────────
    if (request.status === 'PENDING') {
      if (!isSupervisor) {
        return NextResponse.json({ error: 'ต้องเป็นหัวหน้างานหรือผู้จัดการจึงจะอนุมัติขั้นนี้ได้' }, { status: 403 })
      }

      if (body.action === 'APPROVE') {
        await prisma.forgotScanRequest.update({
          where: { id },
          data: {
            status:        'ADMIN_APPROVED',
            supervisorId:  actorId,
            supervisorNote: note,
            supervisorAt:  new Date(),
          },
        })
        await createNotification({
          userId:  request.userId,
          type:    'FORGOT_SCAN_APPROVED',
          title:   'หัวหน้าอนุมัติแล้ว — รอ HR ยืนยัน',
          message: `คำขอแก้ไขเวลา${label}ผ่านการอนุมัติจากหัวหน้าแล้ว กำลังรอ HR อนุมัติขั้นสุดท้าย`,
          link:    '/forgot-scan',
        })
      } else {
        await prisma.forgotScanRequest.update({
          where: { id },
          data: {
            status:        'REJECTED',
            supervisorId:  actorId,
            supervisorNote: note,
            supervisorAt:  new Date(),
          },
        })
        await createNotification({
          userId:  request.userId,
          type:    'FORGOT_SCAN_REJECTED',
          title:   'คำขอแก้ไขเวลาถูกปฏิเสธ',
          message: `หัวหน้าปฏิเสธคำขอแก้ไขเวลา${label}${note ? `: ${note}` : ''}`,
          link:    '/forgot-scan',
        })
      }
    }

    // ── Step 2: HR final approve ADMIN_APPROVED ──────────────────────────
    else if (request.status === 'ADMIN_APPROVED') {
      if (!isHR) {
        return NextResponse.json({ error: 'ต้องเป็น HR จึงจะอนุมัติขั้นสุดท้ายได้' }, { status: 403 })
      }

      if (body.action === 'APPROVE') {
        const applied = await applyToAttendance(id, prisma, { actorId })
        if (!applied) {
          return NextResponse.json(
            { error: APPLY_ATTENDANCE_FAILED_MSG },
            { status: 422 },
          )
        }

        await prisma.forgotScanRequest.update({
          where: { id },
          data: {
            status: 'APPROVED',
            hrId:   actorId,
            hrNote: note,
            hrAt:   new Date(),
          },
        })

        await createNotification({
          userId:  request.userId,
          type:    'FORGOT_SCAN_APPROVED',
          title:   'คำขอแก้ไขเวลาได้รับอนุมัติ',
          message: `HR อนุมัติแล้ว — ระบบได้อัปเดตเวลา${label}ของคุณเรียบร้อย`,
          link:    '/attendance',
        })
      } else {
        await prisma.forgotScanRequest.update({
          where: { id },
          data: {
            status: 'ADMIN_REJECTED',
            hrId:   actorId,
            hrNote: note,
            hrAt:   new Date(),
          },
        })
        await createNotification({
          userId:  request.userId,
          type:    'FORGOT_SCAN_REJECTED',
          title:   'HR ปฏิเสธคำขอแก้ไขเวลา',
          message: `HR ปฏิเสธคำขอแก้ไขเวลา${label}${note ? `: ${note}` : ''}`,
          link:    '/forgot-scan',
        })
      }
    }

    await createAuditLog({
      actorId,
      targetId:   id,
      targetType: 'ForgotScanRequest',
      action:     body.action === 'APPROVE' ? 'APPROVE' : 'REJECT',
      before:     { status: request.status },
      after:      { action: body.action, note },
      ip,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
