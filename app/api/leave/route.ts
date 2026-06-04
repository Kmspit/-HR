import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { notifyRole, sendLineNotify } from '@/lib/notifications'
import { apiError, runNotify } from '@/lib/api-handler'
import { saveUpload } from '@/lib/save-upload'
import { LEAVE_TYPE_OPTIONS } from '@/lib/leave-types'
import type { LeaveType } from '@prisma/client'
import { ensureDbSchema } from '@/lib/ensure-db-schema'
import {
  findLeaveHolidayConflicts,
  formatHolidayConflictMessage,
  loadHolidaysForBranch,
  parseDateOnly,
} from '@/lib/company-holidays'
import { getDefaultChain, applyChainToLeave } from '@/lib/approval-chain'
import { createAuditLog } from '@/lib/notifications'

const leaveTypes = LEAVE_TYPE_OPTIONS.map((o) => o.value) as [LeaveType, ...LeaveType[]]

const leaveSchema = z.object({
  type: z.enum(leaveTypes),
  startDate: z.string(),
  endDate: z.string(),
  days: z.number().min(1),
  reason: z.string().min(1),
})

export async function POST(req: NextRequest) {
  try {
    await ensureDbSchema()
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const contentType = req.headers.get('content-type') ?? ''
    let parsed: z.infer<typeof leaveSchema>
    let attachmentUrl: string | undefined

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      const body = {
        type: String(formData.get('type') ?? ''),
        startDate: String(formData.get('startDate') ?? ''),
        endDate: String(formData.get('endDate') ?? ''),
        days: Number(formData.get('days') ?? 0),
        reason: String(formData.get('reason') ?? ''),
      }
      const result = leaveSchema.safeParse(body)
      if (!result.success) {
        return NextResponse.json({ error: result.error.errors[0]?.message }, { status: 400 })
      }
      parsed = result.data
      const file = formData.get('attachment') as File | null
      if (file && file.size > 0) {
        attachmentUrl = await saveUpload(file, 'leave', session.user.id)
      }
    } else {
      const body = await req.json()
      const result = leaveSchema.safeParse(body)
      if (!result.success) {
        return NextResponse.json({ error: result.error.errors[0]?.message }, { status: 400 })
      }
      parsed = result.data
    }

    const start = parseDateOnly(parsed.startDate)
    const end = parseDateOnly(parsed.endDate)
    if (!start || !end) {
      return NextResponse.json({ error: 'รูปแบบวันที่ไม่ถูกต้อง' }, { status: 400 })
    }

    const branchId = session.user.branchId ?? null
    const holidays = await loadHolidaysForBranch(prisma, branchId)
    const conflicts = findLeaveHolidayConflicts(start, end, branchId, holidays)
    if (conflicts.length > 0) {
      return NextResponse.json(
        { error: formatHolidayConflictMessage(conflicts), conflicts },
        { status: 400 },
      )
    }

    const isOrdination = parsed.type === 'ORDINATION'
    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'

    const leave = await prisma.leaveRequest.create({
      data: {
        userId: session.user.id,
        type: parsed.type as LeaveType,
        startDate: new Date(parsed.startDate),
        endDate: new Date(parsed.endDate),
        days: parsed.days,
        reason: parsed.reason,
        attachmentUrl,
        // ลาบวช: อนุมัติอัตโนมัติทันที ไม่ต้องรอ Approver
        status: isOrdination ? 'APPROVED' : 'PENDING',
      },
      include: { user: { select: { name: true } } },
    })

    if (isOrdination) {
      // บันทึก audit log สำหรับการอนุมัติอัตโนมัติ
      await createAuditLog({
        actorId:    session.user.id,
        targetId:   leave.id,
        targetType: 'LeaveRequest',
        action:     'APPROVE',
        before:     { status: 'PENDING' },
        after:      { status: 'APPROVED', autoApproved: true, type: 'ORDINATION' },
        ip,
      })
      // แจ้ง HR ว่ามีการลาบวชอัตโนมัติ
      await runNotify(() =>
        notifyRole('MANAGER_HR', 'LEAVE_APPROVED', '🙏 ลาบวชอัตโนมัติ',
          `${leave.user.name} ลาบวช ${parsed.days} วัน (อนุมัติอัตโนมัติ)`, '/approvals'),
      )
      await runNotify(() =>
        sendLineNotify(`\n🔔 [เค เอ็ม เซอร์วิส พลัส] 🙏 ลาบวชอัตโนมัติ\nชื่อ: ${leave.user.name}\nจำนวน: ${parsed.days} วัน`),
      )
      return NextResponse.json({ success: true, id: leave.id, autoApproved: true, chainApplied: false })
    }

    // Apply approval chain if a default one is configured
    const defaultChain = await getDefaultChain(prisma)
    if (defaultChain) {
      await applyChainToLeave(prisma, leave.id, defaultChain.id)
      const firstStep = defaultChain.steps[0]
      if (firstStep?.approverRole) {
        await runNotify(() =>
          notifyRole(firstStep.approverRole!, 'LEAVE_REQUEST', '📅 คำขอลาใหม่ — รออนุมัติขั้น 1', `${leave.user.name} ขอลา ${parsed.days} วัน`, '/approvals'),
        )
      }
    } else {
      // Legacy 2-step: notify ADMIN and MANAGER_HR as before
      await runNotify(() =>
        notifyRole('ADMIN', 'LEAVE_REQUEST', '📅 คำขอลาใหม่', `${leave.user.name} ขอลา ${parsed.days} วัน`, '/approvals'),
      )
      await runNotify(() =>
        notifyRole('MANAGER_HR', 'LEAVE_REQUEST', '📅 คำขอลาใหม่', `${leave.user.name} ขอลา ${parsed.days} วัน`, '/approvals'),
      )
    }

    await runNotify(() =>
      sendLineNotify(`\n🔔 [เค เอ็ม เซอร์วิส พลัส] คำขอลาใหม่\nชื่อ: ${leave.user.name}\nจำนวน: ${parsed.days} วัน`),
    )

    return NextResponse.json({ success: true, id: leave.id, chainApplied: !!defaultChain })
  } catch (err) {
    return apiError(err)
  }
}
