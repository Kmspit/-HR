import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

const CAN_MANAGE = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER', 'LAWYER', 'ENFORCEMENT']
const LARGE_PAYMENT_THRESHOLD = 50000

const userSel = { id: true, name: true, department: true, role: true }

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const page        = Math.max(1, Number(sp.get('page') ?? 1))
  const limit       = 30
  const status      = sp.get('status') ?? ''
  const collectorId = sp.get('collectorId') ?? ''
  const debtorId    = sp.get('debtorId') ?? ''
  const from        = sp.get('from') ?? ''
  const to          = sp.get('to') ?? ''

  const where: Record<string, unknown> = {}
  if (status)      where.status      = status
  if (collectorId) where.collectorId = collectorId
  if (debtorId)    where.debtorId    = debtorId
  if (from || to) {
    where.paymentDate = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to   ? { lte: new Date(to + 'T23:59:59') } : {}),
    }
  }

  // Non-managers only see their own collected payments
  if (!CAN_MANAGE.includes(session.user.role)) {
    where.collectorId = session.user.id
  }

  const [items, total] = await Promise.all([
    prisma.recoveryPayment.findMany({
      where,
      include: {
        debtor:    { select: { id: true, debtorNumber: true, firstName: true, lastName: true } },
        collector: { select: userSel },
        createdBy: { select: userSel },
        promise:   { select: { id: true, promisedAmount: true, promisedDate: true, status: true } },
      },
      orderBy: { paymentDate: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
    }),
    prisma.recoveryPayment.count({ where }),
  ])

  return NextResponse.json({ items, total, page, pages: Math.ceil(total / limit) })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CLIENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const {
    caseId, debtorId, clientId, promiseId,
    paymentType, amount, paymentDate, paymentMethod,
    referenceNumber, collectorId, note,
  } = body

  if (!debtorId || !paymentType || !amount || !paymentDate || !paymentMethod) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const payment = await prisma.recoveryPayment.create({
    data: {
      id:              randomUUID(),
      caseId:          caseId         || null,
      debtorId,
      clientId:        clientId       || null,
      promiseId:       promiseId      || null,
      paymentType,
      amount:          Number(amount),
      paymentDate:     new Date(paymentDate),
      paymentMethod,
      referenceNumber: referenceNumber || null,
      collectorId:     collectorId    || session.user.id,
      status:          'PENDING',
      note:            note            || null,
      createdById:     session.user.id,
    },
    include: {
      debtor:    { select: { id: true, debtorNumber: true, firstName: true, lastName: true } },
      collector: { select: userSel },
    },
  })

  return NextResponse.json(payment, { status: 201 })
}
