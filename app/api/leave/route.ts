import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { notifyRole, sendLineNotify } from '@/lib/notifications'
import { apiError, runNotify } from '@/lib/api-handler'

const leaveSchema = z.object({
  type:      z.enum(['SICK', 'VACATION', 'PERSONAL', 'UNPAID', 'MATERNITY', 'ORDINATION']),
  startDate: z.string(),
  endDate:   z.string(),
  days:      z.number().min(1),
  reason:    z.string().min(1),
})

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const parsed = leaveSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message }, { status: 400 })

    const data = parsed.data
    const leave = await prisma.leaveRequest.create({
      data: {
        userId:    session.user.id,
        type:      data.type,
        startDate: new Date(data.startDate),
        endDate:   new Date(data.endDate),
        days:      data.days,
        reason:    data.reason,
        status:    'PENDING',
      },
      include: { user: { select: { name: true } } },
    })

    await runNotify(() => notifyRole('ADMIN', 'LEAVE_REQUEST', '📅 คำขอลาใหม่', `${leave.user.name} ขอลา ${data.days} วัน (${data.type})`, '/approvals'))
    await runNotify(() => notifyRole('MANAGER_HR', 'LEAVE_REQUEST', '📅 คำขอลาใหม่', `${leave.user.name} ขอลา ${data.days} วัน`, '/approvals'))
    await runNotify(() => sendLineNotify(`\n🔔 [HRFlow] คำขอลาใหม่\nชื่อ: ${leave.user.name}\nประเภท: ${data.type}\nจำนวน: ${data.days} วัน`))

    return NextResponse.json({ success: true, id: leave.id })
  } catch (err) {
    return apiError(err)
  }
}
