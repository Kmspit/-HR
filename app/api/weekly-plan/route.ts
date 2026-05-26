import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyRole, sendLineNotify } from '@/lib/notifications'
import { apiError, runNotify } from '@/lib/api-handler'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'LAWYER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const body = await req.json()
    const { weekStart, weekEnd, days, note, isLate } = body

    if (!weekStart || !weekEnd || !Array.isArray(days) || days.length === 0) {
      return NextResponse.json({ error: 'กรุณากรอกข้อมูลให้ครบ' }, { status: 400 })
    }

    const deadline = new Date(weekStart)
    deadline.setDate(deadline.getDate() - 1)

    const plan = await prisma.weeklyLawyerPlan.create({
      data: {
        lawyerId:  session.user.id,
        weekStart: new Date(weekStart),
        weekEnd:   new Date(weekEnd),
        deadline,
        note: note || null,
        isLate:    !!isLate,
        status:    'PENDING',
        days: {
          create: days.map((d: { dayOfWeek: number; startTime: string; endTime: string; place: string; purpose: string; client: string; note: string }) => ({
            dayOfWeek: d.dayOfWeek,
            date:      new Date(weekStart),
            startTime: d.startTime || null,
            endTime:   d.endTime || null,
            place:     d.place || '',
            purpose:   d.purpose || '',
            client:    d.client || null,
            note:      d.note || null,
          })),
        },
      },
      include: { lawyer: { select: { name: true } } },
    })

    await runNotify(() => notifyRole('ADMIN', 'OUTSIDE_REQUEST', '📋 แผนงานทนายใหม่', `${plan.lawyer.name} ส่งแผนงานสัปดาห์${isLate ? ' (ส่งช้า ⚠️)' : ''}`, '/approvals'))
    await runNotify(() => sendLineNotify(`\n🔔 [เค เอ็ม เซอร์วิส พลัส] แผนงานทนายใหม่\nชื่อ: ${plan.lawyer.name}\nสัปดาห์: ${new Date(weekStart).toLocaleDateString('th-TH')}`))

    return NextResponse.json({ success: true, id: plan.id })
  } catch (err) {
    return apiError(err)
  }
}
