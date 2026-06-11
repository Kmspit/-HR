import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'

// Vercel Cron: daily at 8am
// Add to vercel.json: { "crons": [{ "path": "/api/cron/invoice-reminders", "schedule": "0 8 * * *" }] }

export async function POST() {
  const now         = new Date()
  const reminders   = [30, 7, 1]
  let   notified    = 0

  const recipients = await prisma.user.findMany({
    where:  { role: { in: ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN'] as never[] }, status: 'ACTIVE' },
    select: { id: true },
  })

  // Upcoming reminders
  for (const days of reminders) {
    const target  = new Date(now.getTime() + days * 86400_000)
    const dayFrom = new Date(target); dayFrom.setHours(0, 0, 0, 0)
    const dayTo   = new Date(target); dayTo.setHours(23, 59, 59, 999)

    const invoices = await prisma.billingInvoice.findMany({
      where: {
        dueDate: { gte: dayFrom, lte: dayTo },
        status:  { notIn: ['PAID', 'CANCELLED', 'DRAFT'] },
      },
    })
    for (const inv of invoices) {
      for (const r of recipients) {
        void createNotification({
          userId:  r.id,
          type:    'INVOICE_REMINDER',
          title:   `ใบแจ้งหนี้ครบกำหนดใน ${days} วัน`,
          message: `${inv.invoiceNumber} — ${inv.clientName} (฿${inv.remainingAmount.toLocaleString('th-TH')})`,
          link:    `/invoices`,
        })
        notified++
      }
    }
  }

  // Mark overdue + notify
  const overdue = await prisma.billingInvoice.findMany({
    where: {
      dueDate: { lt: now },
      status:  { notIn: ['PAID', 'CANCELLED', 'DRAFT', 'OVERDUE'] },
    },
  })

  for (const inv of overdue) {
    await prisma.billingInvoice.update({ where: { id: inv.id }, data: { status: 'OVERDUE' } })
    for (const r of recipients) {
      void createNotification({
        userId:  r.id,
        type:    'INVOICE_OVERDUE',
        title:   'ใบแจ้งหนี้เกินกำหนดชำระ',
        message: `${inv.invoiceNumber} — ${inv.clientName} (ค้าง ฿${inv.remainingAmount.toLocaleString('th-TH')})`,
        link:    `/invoices`,
      })
      notified++
    }
  }

  return NextResponse.json({ ok: true, notified, overdueUpdated: overdue.length })
}

export async function GET() { return POST() }
