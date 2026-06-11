import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const FINANCE_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!FINANCE_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body   = await req.json()
  const { paymentId, receiverName, note } = body

  const invoice = await prisma.billingInvoice.findUnique({
    where: { id },
    include: { payments: true },
  })
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  // Determine amount from specific payment or total paid
  let amount    = invoice.paidAmount
  let vatAmount = 0
  let whtAmount = 0
  if (paymentId) {
    const pmt = invoice.payments.find(p => p.id === paymentId)
    if (pmt) amount = pmt.amount
  }
  vatAmount = Math.round(amount * invoice.vatRate / (1 + invoice.vatRate) * 100) / 100
  whtAmount = Math.round(amount * invoice.whtRate * 100) / 100

  // Auto-generate receipt number: RCP-YYYY-NNNN
  const year  = new Date().getFullYear()
  const count = await prisma.billingReceipt.count({
    where: { receiptNumber: { startsWith: `RCP-${year}-` } },
  })
  const receiptNumber = `RCP-${year}-${String(count + 1).padStart(4, '0')}`

  const receipt = await prisma.billingReceipt.create({
    data: {
      receiptNumber,
      invoiceId:    id,
      paymentId:    paymentId || null,
      amount,
      vatAmount,
      whtAmount,
      totalAmount:  amount,
      receiverName: receiverName || invoice.clientName,
      issuedAt:     new Date(),
      note:         note || null,
      createdById:  session.user.id,
    },
    include: {
      invoice:   { select: { invoiceNumber: true, clientName: true } },
      createdBy: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json(receipt, { status: 201 })
}
