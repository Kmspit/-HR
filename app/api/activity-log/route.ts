import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { headers } from 'next/headers'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp      = req.nextUrl.searchParams
  const docType = sp.get('docType') ?? undefined
  const docId   = sp.get('docId')   ?? undefined
  const actorId = sp.get('actorId') ?? undefined
  const action  = sp.get('action')  ?? undefined
  const page    = Math.max(1, Number(sp.get('page') ?? '1'))
  const take    = 50

  const where: Record<string, unknown> = {}
  if (docType) where.docType = docType
  if (docId)   where.docId   = docId
  if (actorId) where.actorId = actorId
  if (action)  where.action  = action

  const [total, items] = await Promise.all([
    prisma.activityLog.count({ where }),
    prisma.activityLog.findMany({
      where,
      include: { actor: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * take,
      take,
    }),
  ])

  return NextResponse.json({ items, total, page, pages: Math.ceil(total / take) })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const hdrs      = await headers()
  const ip        = hdrs.get('x-forwarded-for') ?? 'unknown'
  const userAgent = hdrs.get('user-agent') ?? undefined
  const body      = await req.json()

  const { docType, docId, docRef, action, detail, beforeValue, afterValue } = body
  if (!docType || !docId || !action) {
    return NextResponse.json({ error: 'docType, docId, action are required' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true },
  })

  const log = await prisma.activityLog.create({
    data: {
      actorId:     session.user.id,
      actorName:   user?.name ?? '',
      docType,
      docId,
      docRef:      docRef      ?? null,
      action,
      detail:      detail      ?? null,
      beforeValue: beforeValue ? JSON.stringify(beforeValue) : null,
      afterValue:  afterValue  ? JSON.stringify(afterValue)  : null,
      ip,
      userAgent:   userAgent   ?? null,
    },
  })
  return NextResponse.json(log, { status: 201 })
}
