import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'
import { rejectUnauthorizedCron } from '@/lib/cron-secret'
import { apiError } from '@/lib/api-handler'

export async function POST(req: NextRequest) {
 try {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const now = new Date()
  let notified = 0

  // ── Auto-expire contracts whose endDate has already passed ─────────────
  // Nothing else in the app transitions status automatically — a contract can
  // sit ACTIVE indefinitely past its endDate unless someone clicks "หมดอายุ"
  // manually. Every expiry-facing surface (the day-ahead query below,
  // dashboard counts, revenue totals) filters on status: 'ACTIVE', so a stale
  // one is permanently invisible everywhere. Flip it first, same pattern as
  // CourtEvent's auto-MISSED flip (cron/court-reminders/route.ts).
  const overdue = await prisma.clientContract.findMany({
    where: { status: 'ACTIVE', endDate: { lt: now } },
    include: { clientCompany: { select: { companyName: true } } },
  })

  if (overdue.length > 0) {
    // Guard the write with the same status precondition it was just read
    // under, so a contract a human marked TERMINATED/EXPIRED between the
    // read above and this write isn't clobbered back to EXPIRED redundantly.
    await prisma.clientContract.updateMany({
      where: { id: { in: overdue.map((c) => c.id) }, status: 'ACTIVE' },
      data: { status: 'EXPIRED' },
    })

    const expiredRecipients = await prisma.user.findMany({
      where: { role: { in: ['SUPER_ADMIN', 'CEO', 'MANAGER_HR'] as never[] }, status: 'ACTIVE' },
      select: { id: true },
    })

    for (const contract of overdue) {
      for (const user of expiredRecipients) {
        void createNotification({
          userId:  user.id,
          type:    'CONTRACT_EXPIRING',
          title:   '⚠️ สัญญาหมดอายุแล้ว',
          message: `${contract.clientCompany.companyName} — ${contract.contractNumber} (฿${contract.value.toLocaleString('th-TH')})`,
          link:    `/client-companies`,
        })
        notified++
      }
    }
  }

  // ── Day-ahead reminders for contracts still on track to expire ─────────
  const reminders = [7, 30, 60, 90]

  for (const days of reminders) {
    const target  = new Date(now.getTime() + days * 86400_000)
    const dayFrom = new Date(target)
    dayFrom.setHours(0, 0, 0, 0)
    const dayTo = new Date(target)
    dayTo.setHours(23, 59, 59, 999)

    const expiring = await prisma.clientContract.findMany({
      where: { endDate: { gte: dayFrom, lte: dayTo }, status: 'ACTIVE' },
      include: { clientCompany: { select: { companyName: true } } },
    })

    if (expiring.length === 0) continue

    const recipients = await prisma.user.findMany({
      where:  { role: { in: ['SUPER_ADMIN', 'CEO', 'MANAGER_HR'] as never[] }, status: 'ACTIVE' },
      select: { id: true },
    })

    for (const contract of expiring) {
      for (const user of recipients) {
        void createNotification({
          userId:  user.id,
          type:    'CONTRACT_EXPIRING',
          title:   `สัญญาหมดอายุใน ${days} วัน`,
          message: `${contract.clientCompany.companyName} — ${contract.contractNumber} (฿${contract.value.toLocaleString('th-TH')})`,
          link:    `/client-companies`,
        })
        notified++
      }
    }
  }

  return NextResponse.json({ ok: true, notified, autoExpired: overdue.length })
} catch (err) {
  return apiError(err)
 }
}

export async function GET(req: NextRequest) {
 try {
  return POST(req)
} catch (err) {
  return apiError(err)
 }
}
