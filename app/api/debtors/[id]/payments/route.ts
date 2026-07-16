import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'
import { checkDebtorAccess } from '@/lib/debtor-access'
import { parsePositiveAmount } from '@/lib/utils'
import { apiError } from '@/lib/api-handler'

const userSel = { id: true, name: true, department: true, role: true }

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const access = await checkDebtorAccess(prisma, id, session.user.id, session.user.role)
  if (access.status === 'not_found') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (access.status === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const items = await prisma.debtPayment.findMany({
    where: { debtorId: id },
    include: {
      receivedBy: { select: userSel },
      createdBy:  { select: userSel },
    },
    orderBy: { paidAt: 'desc' },
  })
  return NextResponse.json(items)
 } catch (err) {
  return apiError(err)
 }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CLIENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id }  = await params
  const access = await checkDebtorAccess(prisma, id, session.user.id, session.user.role)
  if (access.status === 'not_found') return NextResponse.json({ error: 'Debtor not found' }, { status: 404 })
  if (access.status === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body    = await req.json()
  const { amount, paidAt, channel, receivedById, note } = body

  if (!amount || !paidAt || !channel) {
    return NextResponse.json({ error: 'amount, paidAt, channel are required' }, { status: 400 })
  }
  const validAmount = parsePositiveAmount(amount)
  if (validAmount == null) {
    return NextResponse.json({ error: 'จำนวนเงินต้องมากกว่า 0' }, { status: 400 })
  }

  const debtor = await prisma.debtor.findUnique({ where: { id } })
  if (!debtor) return NextResponse.json({ error: 'Debtor not found' }, { status: 404 })

  // paidAmount/remainingDebt must be atomic increments, not a read-then-write of
  // absolute values — two concurrent payments computed from the same stale read
  // would otherwise silently lose one payment's effect on the running balance
  // (both DebtPayment rows still get created, so the loss is invisible in the
  // payment history and only shows up as a wrong balance).
  const balanceUpdate = await prisma.debtor.update({
    where: { id },
    data: {
      paidAmount:    { increment: validAmount },
      remainingDebt: { decrement: validAmount },
    },
  })
  const newRemainingDebt = Math.max(0, balanceUpdate.remainingDebt)
  const newStatus = newRemainingDebt <= 0 ? 'PAID' : 'PARTIAL_PAYMENT'

  const [payment] = await prisma.$transaction([
    prisma.debtPayment.create({
      data: {
        debtorId:    id,
        amount:      validAmount,
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
      data:  { remainingDebt: newRemainingDebt, status: newStatus },
    }),
  ])

  // Notify assignee
  if (debtor.assignedToId && debtor.assignedToId !== session.user.id) {
    void createNotification({
      userId:  debtor.assignedToId,
      type:    'DEBT_PAYMENT_RECEIVED',
      title:   'ได้รับชำระหนี้',
      message: `${debtor.firstName} ${debtor.lastName} ชำระ ฿${validAmount.toLocaleString('th-TH')} — คงเหลือ ฿${newRemainingDebt.toLocaleString('th-TH')}`,
    })
  }

  return NextResponse.json(payment, { status: 201 })
 } catch (err) {
  return apiError(err)
 }
}
