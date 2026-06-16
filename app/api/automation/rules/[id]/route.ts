import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

const ADMIN_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const rule = await prisma.automationRule.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true } },
      executions: {
        orderBy: { triggeredAt: 'desc' },
        take: 20,
      },
    },
  })
  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(rule)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ADMIN_ROLES.includes(session.user.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const { name, description, trigger, conditions, actions, priority, testMode, isActive } = body

  const updated = await prisma.automationRule.update({
    where: { id },
    data: {
      ...(name !== undefined        ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(trigger !== undefined     ? { trigger } : {}),
      ...(conditions !== undefined  ? { conditions: JSON.stringify(conditions) } : {}),
      ...(actions !== undefined     ? { actions: JSON.stringify(actions) } : {}),
      ...(priority !== undefined    ? { priority } : {}),
      ...(testMode !== undefined    ? { testMode } : {}),
      ...(isActive !== undefined    ? { isActive } : {}),
    },
    include: { createdBy: { select: { id: true, name: true } } },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ADMIN_ROLES.includes(session.user.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  await prisma.automationRule.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
