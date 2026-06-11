import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const userSel = { id: true, name: true, department: true, role: true }

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CLIENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const status    = searchParams.get('status') ?? ''
  const upcoming  = searchParams.get('upcoming') === 'true'
  const overdue   = searchParams.get('overdue')  === 'true'
  const page      = Math.max(1, Number(searchParams.get('page') ?? 1))
  const limit     = 50
  const now       = new Date()

  const where: Record<string, unknown> = {}
  if (status)  where.status = status
  if (upcoming) where.appointDate = { gte: now }
  if (overdue)  where.AND = [{ appointDate: { lt: now } }, { status: 'PENDING' }]

  const [items, total] = await Promise.all([
    prisma.paymentAppointment.findMany({
      where,
      include: {
        debtor:    { select: { id: true, debtorNumber: true, firstName: true, lastName: true, assignedToId: true, phone: true } },
        createdBy: { select: userSel },
      },
      orderBy: { appointDate: 'asc' },
      skip:  (page - 1) * limit,
      take:  limit,
    }),
    prisma.paymentAppointment.count({ where }),
  ])

  return NextResponse.json({ items, total, page, pages: Math.ceil(total / limit) })
}
