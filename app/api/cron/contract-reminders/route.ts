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
  const reminders = [7, 30, 60, 90]
  let notified = 0

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

  return NextResponse.json({ ok: true, notified })
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
