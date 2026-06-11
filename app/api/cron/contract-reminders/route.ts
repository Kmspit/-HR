import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'

// Called by Vercel Cron (or manually by CEO/admin)
// Add to vercel.json: { "crons": [{ "path": "/api/cron/contract-reminders", "schedule": "0 8 * * *" }] }

export async function POST() {
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
}

export async function GET() {
  return POST()
}
