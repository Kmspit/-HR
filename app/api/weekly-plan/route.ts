import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyRole, sendLineNotify } from '@/lib/notifications'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'LAWYER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await req.json()
  const { weekStart, weekEnd, days, note, isLate } = body

  const deadline = new Date(weekStart)
  deadline.setDate(deadline.getDate() - 1) // Sunday before

  const plan = await prisma.weeklyLawyerPlan.create({
    data: {
      lawyerId:  session.user.id,
      weekStart: new Date(weekStart),
      weekEnd:   new Date(weekEnd),
      deadline,
      note,
      isLate:    !!isLate,
      status:    'PENDING',
      days: {
        create: days.map((d: { dayOfWeek: number; startTime: string; endTime: string; place: string; purpose: string; client: string; note: string }) => ({
          dayOfWeek: d.dayOfWeek,
          date:      new Date(weekStart),
          startTime: d.startTime,
          endTime:   d.endTime,
          place:     d.place,
          purpose:   d.purpose,
          client:    d.client,
          note:      d.note,
        })),
      },
    },
    include: { lawyer: { select: { name: true } } },
  })

  await notifyRole('ADMIN', 'OUTSIDE_REQUEST', '📋 แผนงานทนายใหม่', `${plan.lawyer.name} ส่งแผนงานสัปดาห์${isLate ? ' (ส่งช้า ⚠️)' : ''}`, '/approvals')
  await sendLineNotify(`\n🔔 [HRFlow] แผนงานทนายใหม่\nชื่อ: ${plan.lawyer.name}\nสัปดาห์: ${new Date(weekStart).toLocaleDateString('th-TH')}${isLate ? '\n⚠️ ส่งช้า' : ''}`)

  return NextResponse.json({ success: true, id: plan.id })
}
