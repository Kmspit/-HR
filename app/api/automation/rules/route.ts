import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

const ADMIN_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page    = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const trigger = searchParams.get('trigger') ?? undefined
  const active  = searchParams.get('active')

  const where = {
    ...(trigger ? { trigger } : {}),
    ...(active !== null && active !== undefined ? { isActive: active === 'true' } : {}),
  }

  const [rules, total] = await Promise.all([
    prisma.automationRule.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { executions: true } },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * 20,
      take: 20,
    }),
    prisma.automationRule.count({ where }),
  ])

  return NextResponse.json({ rules, total, page, pages: Math.ceil(total / 20) })
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!ADMIN_ROLES.includes(session.user.role))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const { name, description, trigger, conditions, actions, priority, testMode } = body

    if (!name || !trigger)
      return NextResponse.json({ error: 'name and trigger are required' }, { status: 400 })

    const rule = await prisma.automationRule.create({
      data: {
        id:          randomUUID(),
        name,
        description: description ?? null,
        trigger,
        conditions:  JSON.stringify(Array.isArray(conditions) ? conditions : []),
        actions:     JSON.stringify(Array.isArray(actions) ? actions : []),
        priority:    typeof priority === 'number' ? priority : 0,
        testMode:    testMode === true,
        createdById: session.user.id,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    })

    return NextResponse.json(rule, { status: 201 })
  } catch (err) {
    console.error('[POST /api/automation/rules]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
