import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'
import { triggerAutomation } from '@/lib/automation-engine'
import { checkDebtorAccess } from '@/lib/debtor-access'
import { apiError } from '@/lib/api-handler'
import { createAuditLog } from '@/lib/notifications'

const CAN_MANAGE = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'LAWYER', 'ENFORCEMENT', 'TEAM_LEADER']

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
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
} catch (err) {
  return apiError(err)
 }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
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

  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'

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

  await createAuditLog({
    actorId:    session.user.id,
    targetId:   promise.id,
    targetType: 'PromiseToPay',
    action:     'CREATE',
    after: {
      debtorId:       id,
      promisedAmount: promise.promisedAmount,
      promisedDate:   promise.promisedDate,
      note:           promise.note,
    },
    ip,
  })

  triggerAutomation('PROMISE_CREATED', {
    promiseId:     promise.id,
    debtorId:      id,
    promisedAmount: promise.promisedAmount,
    promisedDate:  promise.promisedDate,
  }, session.user.id).catch(() => undefined)

  return NextResponse.json(promise, { status: 201 })
} catch (err) {
  return apiError(err)
 }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!CAN_MANAGE.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { promiseId, status, actualAmount, actualDate, reason } = await req.json()
  if (!promiseId || !status) return NextResponse.json({ error: 'promiseId and status required' }, { status: 400 })

  // "ทำไม" matters most for the negative outcomes — require a reason so
  // BROKEN/CANCELLED can't be logged with nothing explaining why.
  if ((status === 'BROKEN' || status === 'CANCELLED') && !reason?.trim()) {
    return NextResponse.json({ error: 'reason is required when marking a promise BROKEN or CANCELLED' }, { status: 400 })
  }

  const existing = await prisma.promiseToPay.findFirst({ where: { id: promiseId, debtorId: id } })
  if (!existing) return NextResponse.json({ error: 'Promise not found' }, { status: 404 })

  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'

  const updated = await prisma.promiseToPay.update({
    where: { id: promiseId, debtorId: id },
    data: {
      status,
      actualAmount: actualAmount ? Number(actualAmount) : undefined,
      actualDate: actualDate ? new Date(actualDate) : undefined,
    },
  })

  await createAuditLog({
    actorId:    session.user.id,
    targetId:   promiseId,
    targetType: 'PromiseToPay',
    action:     'UPDATE',
    before: {
      status:       existing.status,
      actualAmount: existing.actualAmount,
      actualDate:   existing.actualDate,
    },
    after: {
      status:       updated.status,
      actualAmount: updated.actualAmount,
      actualDate:   updated.actualDate,
      reason:       reason?.trim() || null,
    },
    ip,
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
} catch (err) {
  return apiError(err)
 }
}
