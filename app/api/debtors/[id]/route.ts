import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkDebtorAccess, DEBTOR_MANAGE_ROLES as CAN_MANAGE, DEBTOR_DELETE_ROLES as CAN_DELETE } from '@/lib/debtor-access'
import { apiError } from '@/lib/api-handler'
import { createAuditLog } from '@/lib/notifications'

const userSel    = { id: true, name: true, department: true, role: true }

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const access = await checkDebtorAccess(prisma, id, session.user.id, session.user.role)
  if (access.status === 'not_found') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (access.status === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const debtor = await prisma.debtor.findUnique({
    where: { id },
    include: {
      assignedTo: { select: userSel },
      createdBy:  { select: userSel },
      followUps: {
        include: { performedBy: { select: userSel } },
        orderBy: { followedAt: 'desc' },
      },
      payments: {
        include: {
          receivedBy: { select: userSel },
          createdBy:  { select: userSel },
        },
        orderBy: { paidAt: 'desc' },
      },
      appointments: {
        include: { createdBy: { select: userSel } },
        orderBy: { appointDate: 'asc' },
      },
      files: {
        include: { createdBy: { select: userSel } },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!debtor) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(debtor)
} catch (err) {
  return apiError(err)
 }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CLIENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id }  = await params

  const existingDebtor = await prisma.debtor.findUnique({ where: { id }, select: { assignedToId: true, paidAmount: true, deletedAt: true } })
  if (!existingDebtor || existingDebtor.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!CAN_MANAGE.includes(session.user.role) && existingDebtor.assignedToId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body    = await req.json()

  const allowed = [
    'firstName', 'lastName', 'caseNumber', 'taskId', 'nationalId',
    'phone', 'phone2', 'phone3', 'lineId', 'email', 'facebook',
    'address', 'province', 'workplace', 'occupation', 'incomeEstimate',
    'riskLevel', 'preferredContactTime', 'contactPreference', 'tags',
    'workplaceAddress', 'registeredAddress', 'assetAddress',
    'assignedToId', 'status', 'totalDebt', 'startDate', 'note',
  ]

  const data: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) {
      if (key === 'startDate') {
        data[key] = body[key] ? new Date(body[key]) : null
      } else if (key === 'totalDebt') {
        const total       = Number(body[key] ?? 0)
        data['totalDebt'] = total
        // recalculate remaining from current paidAmount
        data['remainingDebt'] = Math.max(0, total - existingDebtor.paidAmount)
      } else {
        data[key] = body[key] === '' ? null : body[key]
      }
    }
  }

  const debtor = await prisma.debtor.update({
    where: { id },
    data,
    include: {
      assignedTo: { select: userSel },
      createdBy:  { select: userSel },
    },
  })

  return NextResponse.json(debtor)
} catch (err) {
  return apiError(err)
 }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!CAN_DELETE.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const existing = await prisma.debtor.findUnique({ where: { id }, select: { deletedAt: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.deletedAt) return NextResponse.json({ error: 'รายการนี้ถูกลบไปแล้ว' }, { status: 400 })

  // Soft-delete only — ข้อมูลลูกหนี้อาจต้องตรวจสอบย้อนหลัง ห้าม hard delete.
  const result = await prisma.debtor.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date(), deletedById: session.user.id },
  })
  if (result.count === 0) {
    return NextResponse.json({ error: 'รายการนี้ถูกลบไปแล้ว' }, { status: 400 })
  }

  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  await createAuditLog({
    actorId: session.user.id, targetId: id, targetType: 'Debtor',
    action: 'DELETE',
    before: { deletedAt: null },
    after:  { deletedAt: new Date().toISOString() },
    ip,
  })

  return NextResponse.json({ ok: true })
} catch (err) {
  return apiError(err)
 }
}
