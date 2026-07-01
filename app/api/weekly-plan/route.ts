import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendLineNotify } from '@/lib/notifications'
import { apiError, runNotify } from '@/lib/api-handler'
import { dateForPlanDay } from '@/lib/weekly-plan-days'
import { getDefaultChain } from '@/lib/approval-chain'
import { applyChainToWeeklyPlan } from '@/lib/weekly-plan-chain'
import { requireCsrf } from '@/lib/api-guard'

export async function POST(req: NextRequest) {
  try {
    const csrfErr = requireCsrf(req)
    if (csrfErr) return csrfErr

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
        status: 'PENDING',
        days: {
          create: filledDays.map((d: { dayOfWeek: number; startTime: string; endTime: string; place: string; purpose: string; client: string; note: string; lat?: number | null; lng?: number | null }) => ({
            dayOfWeek: d.dayOfWeek,
            date:      dateForPlanDay(weekStart, d.dayOfWeek),
            startTime: d.startTime || null,
            endTime:   d.endTime || null,
            place:     String(d.place ?? '').trim(),
            purpose:   String(d.purpose ?? '').trim(),
            client:    d.client?.trim() || null,
            note:      d.note?.trim() || null,
            lat:       d.lat ?? null,
            lng:       d.lng ?? null,
          })),
        },
      },
      include: { lawyer: { select: { name: true } } },
    })

    const defaultChain = await getDefaultChain(prisma, 'WEEKLY_PLAN')
    if (!defaultChain) {
      return NextResponse.json(
        { error: 'ยังไม่ได้ตั้งค่าสายอนุมัติแผนงาน — ติดต่อ HR', code: 'NO_CHAIN' },
        { status: 503 },
      )
    }
    await applyChainToWeeklyPlan(prisma, plan.id, defaultChain.id, session.user.id)

    await runNotify(() => sendLineNotify(`\n🔔 [เค เอ็ม เซอร์วิส พลัส] แผนงานทนายใหม่\nชื่อ: ${plan.lawyer.name}\nสัปดาห์: ${new Date(weekStart).toLocaleDateString('th-TH')}`))

    return NextResponse.json({ success: true, id: plan.id, chainApplied: true })
  } catch (err) {
    return apiError(err)
  }
}
