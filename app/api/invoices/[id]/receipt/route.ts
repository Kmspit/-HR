import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireCsrf } from '@/lib/api-guard'

const FINANCE_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfErr = requireCsrf(req)
  if (csrfErr) return csrfErr

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
    include: { payments: true, receipts: true },
  })
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  // Determine amount from the specific payment (never cumulative paidAmount,
  // which would overstate/duplicate the receipt on a repeat call).
  let amount: number
  if (paymentId) {
    const pmt = invoice.payments.find(p => p.id === paymentId)
    if (!pmt) return NextResponse.json({ error: 'ไม่พบรายการชำระเงินนี้ในใบแจ้งหนี้' }, { status: 404 })
    if (invoice.receipts.some(r => r.paymentId === paymentId)) {
      return NextResponse.json({ error: 'ออกใบเสร็จสำหรับรายการชำระเงินนี้ไปแล้ว' }, { status: 409 })
    }
    amount = pmt.amount
  } else {
    const alreadyReceipted = invoice.receipts.reduce((sum, r) => sum + r.amount, 0)
    amount = invoice.paidAmount - alreadyReceipted
    if (amount <= 0) {
      return NextResponse.json({ error: 'ออกใบเสร็จครบยอดชำระแล้ว' }, { status: 409 })
    }
  }
  const vatAmount = Math.round(amount * invoice.vatRate / (1 + invoice.vatRate) * 100) / 100
  const whtAmount = Math.round(amount * invoice.whtRate * 100) / 100

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
