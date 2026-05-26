import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { notifyRole, sendLineNotify } from '@/lib/notifications'
import { apiError, runNotify } from '@/lib/api-handler'
import { saveUpload } from '@/lib/save-upload'
import { LEAVE_TYPE_OPTIONS } from '@/lib/leave-types'
import type { LeaveType } from '@prisma/client'

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

    const leave = await prisma.leaveRequest.create({
      data: {
        userId: session.user.id,
        type: parsed.type as LeaveType,
        startDate: new Date(parsed.startDate),
        endDate: new Date(parsed.endDate),
        days: parsed.days,
        reason: parsed.reason,
        attachmentUrl,
        status: 'PENDING',
      },
      include: { user: { select: { name: true } } },
    })

    await runNotify(() =>
      notifyRole('ADMIN', 'LEAVE_REQUEST', '📅 คำขอลาใหม่', `${leave.user.name} ขอลา ${parsed.days} วัน`, '/approvals'),
    )
    await runNotify(() =>
      notifyRole('MANAGER_HR', 'LEAVE_REQUEST', '📅 คำขอลาใหม่', `${leave.user.name} ขอลา ${parsed.days} วัน`, '/approvals'),
    )
    await runNotify(() =>
      sendLineNotify(`\n🔔 [HRFlow] คำขอลาใหม่\nชื่อ: ${leave.user.name}\nจำนวน: ${parsed.days} วัน`),
    )

    return NextResponse.json({ success: true, id: leave.id })
  } catch (err) {
    return apiError(err)
  }
}
