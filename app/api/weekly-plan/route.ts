import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyRole, sendLineNotify } from '@/lib/notifications'
import { apiError, runNotify } from '@/lib/api-handler'
import { dateForPlanDay } from '@/lib/weekly-plan-days'
import { ensureDbSchema } from '@/lib/ensure-db-schema'

export async function POST(req: NextRequest) {
  try {
    await ensureDbSchema().catch(() => {})
    const session = await auth()
    if (!session?.user || session.user.role !== 'LAWYER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const body = await req.json()
    const { weekStart, weekEnd, days, note, isLate } = body

    if (!weekStart || !weekEnd || !Array.isArray(days)) {
      return NextResponse.json({ error: 'กรุณาระบุช่วงสัปดาห์' }, { status: 400 })
    }

    const filledDays = days.filter(
      (d: { place?: string; purpose?: string }) =>
        String(d.place ?? '').trim() || String(d.purpose ?? '').trim(),
    )

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
        status:         'PENDING',
        approvalStatus: 'pending_supervisor',
        days: {
          create: filledDays.map((d: { dayOfWeek: number; startTime: string; endTime: string; place: string; purpose: string; client: string; note: string }) => ({
            dayOfWeek: d.dayOfWeek,
            date:      dateForPlanDay(weekStart, d.dayOfWeek),
            startTime: d.startTime || null,
            endTime:   d.endTime || null,
            place:     String(d.place ?? '').trim(),
            purpose:   String(d.purpose ?? '').trim(),
            client:    d.client?.trim() || null,
            note:      d.note?.trim() || null,
          })),
        },
      },
      include: { lawyer: { select: { name: true } } },
    })

    // Step 1: notify หัวหน้างาน (MANAGER_HR) first
    await runNotify(() => notifyRole('MANAGER_HR', 'OUTSIDE_REQUEST', '📋 แผนงานทนายใหม่', `${plan.lawyer.name} ส่งแผนงานสัปดาห์${isLate ? ' (ส่งช้า ⚠️)' : ''} — รอหัวหน้างานอนุมัติ`, '/approvals'))
    await runNotify(() => sendLineNotify(`\n🔔 [เค เอ็ม เซอร์วิส พลัส] แผนงานทนายใหม่\nชื่อ: ${plan.lawyer.name}\nสัปดาห์: ${new Date(weekStart).toLocaleDateString('th-TH')}`))

    return NextResponse.json({ success: true, id: plan.id })
  } catch (err) {
    return apiError(err)
  }
}
