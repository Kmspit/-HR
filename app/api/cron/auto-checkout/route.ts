/**
 * Auto Check-out Cron
 * Runs daily at 22:00 Bangkok (15:00 UTC) via Vercel Cron.
 * Finds all open attendance sessions (checkIn set, checkOut null)
 * from the past 48 hours and closes them at 22:00 Bangkok.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { bangkokDateKey } from '@/lib/datetime-bangkok'
import { computeWorkMinutes } from '@/lib/attendance-work-log'
import { createNotification } from '@/lib/notifications'
import { createAuditLog } from '@/lib/notifications'
import { rejectUnauthorizedCron } from '@/lib/cron-secret'

const AUTO_CHECKOUT_NOTE = 'ระบบปิดเวลาออกงานอัตโนมัติ'

export async function GET(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const now = new Date()

  // 22:00 Bangkok today — this is the auto-checkout timestamp
  const todayKey = bangkokDateKey(now)
  const autoCheckoutTime = new Date(`${todayKey}T22:00:00+07:00`)

  // Safety: only process sessions where checkIn happened before the cutoff
  // and within the last 48 hours (catches missed previous-day cron runs)
  const lookbackMs = 48 * 60 * 60 * 1000
  const lookbackFrom = new Date(autoCheckoutTime.getTime() - lookbackMs)

  const openSessions = await prisma.attendance.findMany({
    where: {
      checkIn:      { not: null, gte: lookbackFrom, lte: autoCheckoutTime },
      checkOut:     null,
      autoCheckout: false,
    },
    include: { user: { select: { id: true, name: true } } },
  })

  if (openSessions.length === 0) {
    return NextResponse.json({ message: 'ไม่มีรอบงานที่ยังค้างอยู่', count: 0 })
  }

  let applied = 0
  const errors: string[] = []

  for (const session of openSessions) {
    try {
      const workMinutes = computeWorkMinutes({
        checkIn:  session.checkIn!,
        checkOut: autoCheckoutTime,
        lunchOut: session.lunchOut,
        lunchIn:  session.lunchIn,
      })

      await prisma.attendance.update({
        where: { id: session.id },
        data: {
          checkOut:     autoCheckoutTime,
          autoCheckout: true,
          workMinutes,
          attendanceStatus: 'completed',
          note: AUTO_CHECKOUT_NOTE,
        },
      })

      // Notify employee
      await createNotification({
        userId:  session.user.id,
        type:    'SYSTEM',
        title:   'ระบบปิดเวลาออกงานอัตโนมัติ',
        message: `ระบบบันทึกเวลาออกงานให้อัตโนมัติที่ 22:00 น. เนื่องจากไม่พบการเช็คเอาท์ — หากไม่ถูกต้องสามารถยื่นคำขอแก้ไขได้ที่เมนู "แก้ไขเวลาลงงาน"`,
        link:    '/attendance',
      })

      // Audit log
      await createAuditLog({
        actorId:    'system',
        targetId:   session.id,
        targetType: 'Attendance',
        action:     'UPDATE',
        before:     { checkOut: null },
        after:      { checkOut: autoCheckoutTime.toISOString(), autoCheckout: true, workMinutes },
      })

      applied++
    } catch (err) {
      console.error('[auto-checkout]', session.id, err)
      errors.push(session.id)
    }
  }

  console.log(`[auto-checkout] applied=${applied} errors=${errors.length}`)
  return NextResponse.json({ message: 'สำเร็จ', applied, errors: errors.length > 0 ? errors : undefined })
}
