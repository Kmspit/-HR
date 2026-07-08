import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'
import { triggerAutomation } from '@/lib/automation-engine'
import { requireCsrf } from '@/lib/api-guard'
import { checkDebtorAccess } from '@/lib/debtor-access'

const CAN_MANAGE = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'LAWYER', 'ENFORCEMENT', 'TEAM_LEADER']

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const access = await checkDebtorAccess(prisma, id, session.user.id, session.user.role)
  if (access.status === 'not_found') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (access.status === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const promises = await prisma.promiseToPay.findMany({
    where: { debtorId: id },
    include: { createdBy: { select: { id: true, name: true } } },
    orderBy: { promisedDate: 'desc' },
  })
  return NextResponse.json(promises)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!CAN_MANAGE.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const access = await checkDebtorAccess(prisma, id, session.user.id, session.user.role)
  if (access.status === 'not_found') return NextResponse.json({ error: 'Debtor not found' }, { status: 404 })
  if (access.status === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { promisedAmount, promisedDate, note } = body

  if (!promisedAmount || !promisedDate) {
    return NextResponse.json({ error: 'promisedAmount and promisedDate required' }, { status: 400 })
  }

  const promise = await prisma.promiseToPay.create({
    data: {
      id: randomUUID(),
      debtorId: id,
      promisedAmount: Number(promisedAmount),
      promisedDate: new Date(promisedDate),
      note: note || null,
      status: 'PENDING',
      createdById: session.user.id!,
    },
    include: { createdBy: { select: { id: true, name: true } } },
  })
  triggerAutomation('PROMISE_CREATED', {
    promiseId:     promise.id,
    debtorId:      id,
    promisedAmount: promise.promisedAmount,
    promisedDate:  promise.promisedDate,
  }, session.user.id).catch(() => undefined)

  return NextResponse.json(promise, { status: 201 })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfErr = requireCsrf(req)
  if (csrfErr) return csrfErr

  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!CAN_MANAGE.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { promiseId, status, actualAmount, actualDate } = await req.json()
  if (!promiseId || !status) return NextResponse.json({ error: 'promiseId and status required' }, { status: 400 })

  const updated = await prisma.promiseToPay.update({
    where: { id: promiseId, debtorId: id },
    data: {
      status,
      actualAmount: actualAmount ? Number(actualAmount) : undefined,
      actualDate: actualDate ? new Date(actualDate) : undefined,
    },
  })

  if (status === 'BROKEN') {
    triggerAutomation('PROMISE_BROKEN', {
      promiseId,
      debtorId: id,
      promisedAmount: updated.promisedAmount,
      promisedDate:   updated.promisedDate,
    }, session.user.id).catch(() => undefined)
  }

  return NextResponse.json(updated)
}
