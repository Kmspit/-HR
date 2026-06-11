import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'

const userSel = { id: true, name: true, department: true, role: true }

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const items = await prisma.debtPayment.findMany({
    where: { debtorId: id },
    include: {
      receivedBy: { select: userSel },
      createdBy:  { select: userSel },
    },
    orderBy: { paidAt: 'desc' },
  })
  return NextResponse.json(items)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CLIENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id }  = await params
  const body    = await req.json()
  const { amount, paidAt, channel, receivedById, note } = body

  if (!amount || !paidAt || !channel) {
    return NextResponse.json({ error: 'amount, paidAt, channel are required' }, { status: 400 })
  }

  const debtor = await prisma.debtor.findUnique({ where: { id } })
  if (!debtor) return NextResponse.json({ error: 'Debtor not found' }, { status: 404 })

  const newPaidAmount    = debtor.paidAmount + Number(amount)
  const newRemainingDebt = Math.max(0, debtor.totalDebt - newPaidAmount)
  const newStatus = newRemainingDebt <= 0 ? 'PAID' : 'PARTIAL_PAYMENT'

  const [payment] = await prisma.$transaction([
    prisma.debtPayment.create({
      data: {
        debtorId:    id,
        amount:      Number(amount),
        paidAt:      new Date(paidAt),
        channel,
        receivedById: receivedById || null,
        note:        note || null,
        createdById: session.user.id,
      },
      include: {
        receivedBy: { select: userSel },
        createdBy:  { select: userSel },
      },
    }),
    prisma.debtor.update({
      where: { id },
      data:  { paidAmount: newPaidAmount, remainingDebt: newRemainingDebt, status: newStatus },
    }),
  ])

  // Notify assignee
  if (debtor.assignedToId && debtor.assignedToId !== session.user.id) {
    void createNotification({
      userId:  debtor.assignedToId,
      type:    'DEBT_PAYMENT_RECEIVED',
      title:   'ได้รับชำระหนี้',
      message: `${debtor.firstName} ${debtor.lastName} ชำระ ฿${Number(amount).toLocaleString('th-TH')} — คงเหลือ ฿${newRemainingDebt.toLocaleString('th-TH')}`,
    })
  }

  return NextResponse.json(payment, { status: 201 })
}
