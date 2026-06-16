import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const CAN_DELETE = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR']
const userSel    = { id: true, name: true, department: true, role: true }

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
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
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id }  = await params
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
        const existing    = await prisma.debtor.findUnique({ where: { id }, select: { paidAmount: true } })
        data['remainingDebt'] = Math.max(0, total - (existing?.paidAmount ?? 0))
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
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!CAN_DELETE.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  await prisma.debtor.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
