import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'
import { checkDebtorAccess } from '@/lib/debtor-access'

const LEGAL_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'LAWYER', 'ENFORCEMENT', 'TEAM_LEADER']

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const access = await checkDebtorAccess(prisma, id, session.user.id, session.user.role)
  if (access.status === 'not_found') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (access.status === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const contacts = await prisma.debtorContact.findMany({
    where: { debtorId: id },
    include: { performedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return NextResponse.json(contacts)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!LEGAL_ROLES.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const access = await checkDebtorAccess(prisma, id, session.user.id, session.user.role)
  if (access.status === 'not_found') return NextResponse.json({ error: 'Debtor not found' }, { status: 404 })
  if (access.status === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { channel, direction = 'OUTBOUND', result, note, duration, promisedAt, promisedAmount, nextContactAt } = body

  if (!channel || !result) return NextResponse.json({ error: 'channel and result required' }, { status: 400 })

  const contact = await prisma.debtorContact.create({
    data: {
      id: randomUUID(),
      debtorId: id,
      channel,
      direction,
      result,
      note: note || null,
      duration: duration ? Number(duration) : null,
      promisedAt: promisedAt ? new Date(promisedAt) : null,
      promisedAmount: promisedAmount ? Number(promisedAmount) : null,
      nextContactAt: nextContactAt ? new Date(nextContactAt) : null,
      performedById: session.user.id!,
    },
    include: { performedBy: { select: { id: true, name: true } } },
  })

  // Update lastContactAt on the debtor
  await prisma.debtor.update({
    where: { id },
    data: { lastContactAt: new Date() },
  })

  return NextResponse.json(contact, { status: 201 })
}
