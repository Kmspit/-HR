import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'

const userSel = { id: true, name: true, department: true, role: true }

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const items = await prisma.paymentAppointment.findMany({
    where: { debtorId: id },
    include: { createdBy: { select: userSel } },
    orderBy: { appointDate: 'asc' },
  })
  return NextResponse.json(items)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CLIENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id }  = await params
  const body    = await req.json()
  const { appointDate, agreedAmount, location, note } = body

  if (!appointDate) {
    return NextResponse.json({ error: 'appointDate is required' }, { status: 400 })
  }

  const debtor = await prisma.debtor.findUnique({ where: { id } })
  if (!debtor) return NextResponse.json({ error: 'Debtor not found' }, { status: 404 })

  const appt = await prisma.paymentAppointment.create({
    data: {
      debtorId:    id,
      appointDate: new Date(appointDate),
      agreedAmount: Number(agreedAmount ?? 0),
      location:    location || null,
      note:        note     || null,
      createdById: session.user.id,
    },
    include: { createdBy: { select: userSel } },
  })

  // Update debtor status to PROMISE_TO_PAY if pending
  await prisma.debtor.updateMany({
    where: { id, status: { in: ['NEW', 'FOLLOWING'] } },
    data:  { status: 'PROMISE_TO_PAY' },
  })

  // Notify assignee of new appointment
  if (debtor.assignedToId && debtor.assignedToId !== session.user.id) {
    void createNotification({
      userId:  debtor.assignedToId,
      type:    'DEBT_APPOINTMENT_DUE',
      title:   'นัดชำระหนี้ใหม่',
      message: `${debtor.firstName} ${debtor.lastName} — ${new Date(appointDate).toLocaleDateString('th-TH')} ฿${Number(agreedAmount ?? 0).toLocaleString('th-TH')}`,
    })
  }

  return NextResponse.json(appt, { status: 201 })
}
