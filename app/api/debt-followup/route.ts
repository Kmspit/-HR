import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const userSel = { id: true, name: true, department: true, role: true }

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CLIENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const q      = searchParams.get('q') ?? ''
  const method = searchParams.get('method') ?? ''
  const from   = searchParams.get('from')
  const to     = searchParams.get('to')
  const page   = Math.max(1, Number(searchParams.get('page') ?? 1))
  const limit  = 50

  const where: Record<string, unknown> = {}
  if (q)      where.OR = [{ result: { contains: q } }, { note: { contains: q } }, { debtor: { OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }] } }]
  if (method) where.method = method
  if (from || to) {
    where.followedAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to   ? { lte: new Date(to)   } : {}),
    }
  }

  const [items, total] = await Promise.all([
    prisma.debtFollowUp.findMany({
      where,
      include: {
        debtor:      { select: { id: true, debtorNumber: true, firstName: true, lastName: true, phone: true } },
        performedBy: { select: userSel },
      },
      orderBy: { followedAt: 'desc' },
      skip:  (page - 1) * limit,
      take:  limit,
    }),
    prisma.debtFollowUp.count({ where }),
  ])

  return NextResponse.json({ items, total, page, pages: Math.ceil(total / limit) })
}
