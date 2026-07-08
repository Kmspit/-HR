import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkDebtorAccess } from '@/lib/debtor-access'

const userSel = { id: true, name: true, department: true, role: true }

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const access = await checkDebtorAccess(prisma, id, session.user.id, session.user.role)
  if (access.status === 'not_found') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (access.status === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const items = await prisma.debtFollowUp.findMany({
    where: { debtorId: id },
    include: { performedBy: { select: userSel } },
    orderBy: { followedAt: 'desc' },
  })
  return NextResponse.json(items)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CLIENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id }  = await params
  const access = await checkDebtorAccess(prisma, id, session.user.id, session.user.role)
  if (access.status === 'not_found') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (access.status === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body    = await req.json()
  const { method, followedAt, result, note, nextFollowUp } = body

  if (!method || !followedAt || !result) {
    return NextResponse.json({ error: 'method, followedAt, result are required' }, { status: 400 })
  }

  const followUp = await prisma.debtFollowUp.create({
    data: {
      debtorId:      id,
      method,
      followedAt:    new Date(followedAt),
      result,
      note:          note        || null,
      nextFollowUp:  nextFollowUp ? new Date(nextFollowUp) : null,
      performedById: session.user.id,
    },
    include: { performedBy: { select: userSel } },
  })

  // Auto-update debtor status to FOLLOWING if still NEW
  await prisma.debtor.updateMany({
    where: { id, status: 'NEW' },
    data:  { status: 'FOLLOWING' },
  })

  return NextResponse.json(followUp, { status: 201 })
}
