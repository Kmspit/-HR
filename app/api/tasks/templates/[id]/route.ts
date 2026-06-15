import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

const CAN_MANAGE = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const template = await prisma.taskTemplate.findUnique({
    where: { id },
    include: { createdBy: { select: { id: true, name: true } } },
  })
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ template })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const template = await prisma.taskTemplate.findUnique({ where: { id } })
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner  = template.createdById === session.user.id
  const isAdmin  = CAN_MANAGE.includes(session.user.role)
  if (!isOwner && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const data: Record<string, unknown> = {}

  if (body.name               !== undefined) data.name               = body.name.trim()
  if (body.description        !== undefined) data.description        = body.description?.trim() ?? null
  if (body.category           !== undefined) data.category           = body.category
  if (body.taskType           !== undefined) data.taskType           = body.taskType ?? null
  if (body.priority           !== undefined) data.priority           = body.priority
  if (body.defaultSlaHours    !== undefined) data.defaultSlaHours    = body.defaultSlaHours ? Number(body.defaultSlaHours) : null
  if (body.defaultAssigneeRole !== undefined) data.defaultAssigneeRole = body.defaultAssigneeRole ?? null
  if (body.department         !== undefined) data.department         = body.department ?? null
  if (body.notes              !== undefined) data.notes              = body.notes?.trim() ?? null
  if (body.sortOrder          !== undefined) data.sortOrder          = Number(body.sortOrder)
  if (body.isActive           !== undefined) data.isActive           = Boolean(body.isActive)
  if (Array.isArray(body.defaultChecklist)) {
    data.defaultChecklist = JSON.stringify(
      body.defaultChecklist.filter((i: { title?: string }) => i?.title?.trim())
    )
  }

  const updated = await prisma.taskTemplate.update({
    where: { id },
    data,
    include: { createdBy: { select: { id: true, name: true } } },
  })

  return NextResponse.json({ template: updated })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const template = await prisma.taskTemplate.findUnique({ where: { id } })
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner = template.createdById === session.user.id
  const isAdmin = CAN_MANAGE.includes(session.user.role)
  if (!isOwner && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Soft-delete: deactivate instead of hard delete to preserve task history
  await prisma.taskTemplate.update({ where: { id }, data: { isActive: false } })
  return NextResponse.json({ ok: true })
}
