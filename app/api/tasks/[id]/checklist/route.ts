import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-handler'

const CAN_MANAGE_ALL = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR']
const CAN_REVIEW = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']

async function getTaskAndAccess(taskId: string, userId: string, role: string) {
  const task = await prisma.taskAssignment.findUnique({
    where: { id: taskId },
    select: { assigneeId: true, assignedById: true },
  })
  if (!task) return { task: null, canView: false, canManage: false }

  const canView =
    task.assigneeId === userId ||
    task.assignedById === userId ||
    CAN_MANAGE_ALL.includes(role)

  const canManage =
    task.assigneeId === userId ||
    task.assignedById === userId ||
    CAN_REVIEW.includes(role)

  return { task, canView, canManage }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: taskId } = await params
  const { canView } = await getTaskAndAccess(taskId, session.user.id, session.user.role)
  if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const items = await prisma.taskChecklist.findMany({
    where: { taskId },
    select: {
      id: true, title: true, isCompleted: true, order: true,
      completedAt: true,
      completedBy: { select: { id: true, name: true } },
    },
    orderBy: { order: 'asc' },
  })

  return NextResponse.json({ items })
} catch (err) {
  return apiError(err)
 }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: taskId } = await params
  const { task, canManage } = await getTaskAndAccess(taskId, session.user.id, session.user.role)
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()

  // Bulk create: body.items = [{title, order}]
  if (Array.isArray(body.items)) {
    const data = body.items
      .filter((i: { title?: string }) => i?.title?.trim())
      .map((i: { title: string; order?: number }, idx: number) => ({
        taskId,
        title: i.title.trim(),
        order: i.order ?? idx,
      }))
    if (data.length === 0) return NextResponse.json({ error: 'ไม่มีรายการที่ถูกต้อง' }, { status: 400 })
    await prisma.taskChecklist.createMany({ data })
    const items = await prisma.taskChecklist.findMany({
      where: { taskId },
      select: { id: true, title: true, isCompleted: true, order: true, completedAt: true, completedBy: { select: { id: true, name: true } } },
      orderBy: { order: 'asc' },
    })
    return NextResponse.json({ items }, { status: 201 })
  }

  // Single create: body.title
  const { title, order } = body
  if (!title?.trim()) return NextResponse.json({ error: 'กรุณาระบุชื่อรายการ' }, { status: 400 })

  const maxOrder = await prisma.taskChecklist.aggregate({ where: { taskId }, _max: { order: true } })
  const nextOrder = (maxOrder._max.order ?? -1) + 1

  const item = await prisma.taskChecklist.create({
    data: { taskId, title: title.trim(), order: order ?? nextOrder },
    select: { id: true, title: true, isCompleted: true, order: true, completedAt: true, completedBy: { select: { id: true, name: true } } },
  })

  return NextResponse.json({ item }, { status: 201 })
} catch (err) {
  return apiError(err)
 }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: taskId } = await params
  const { searchParams } = new URL(req.url)
  const itemId = searchParams.get('itemId')
  if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 })

  const { task, canManage } = await getTaskAndAccess(taskId, session.user.id, session.user.role)
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const item = await prisma.taskChecklist.findUnique({ where: { id: itemId } })
  if (!item || item.taskId !== taskId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const data: Record<string, unknown> = {}

  if (body.title !== undefined) data.title = body.title.trim()
  if (typeof body.isCompleted === 'boolean') {
    data.isCompleted = body.isCompleted
    data.completedById = body.isCompleted ? session.user.id : null
    data.completedAt = body.isCompleted ? new Date() : null
  }
  if (body.order !== undefined) data.order = body.order

  const updated = await prisma.taskChecklist.update({
    where: { id: itemId },
    data,
    select: { id: true, title: true, isCompleted: true, order: true, completedAt: true, completedBy: { select: { id: true, name: true } } },
  })

  return NextResponse.json({ item: updated })
} catch (err) {
  return apiError(err)
 }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: taskId } = await params
  const { searchParams } = new URL(req.url)
  const itemId = searchParams.get('itemId')
  if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 })

  const { task, canManage } = await getTaskAndAccess(taskId, session.user.id, session.user.role)
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const item = await prisma.taskChecklist.findUnique({ where: { id: itemId } })
  if (!item || item.taskId !== taskId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.taskChecklist.delete({ where: { id: itemId } })
  return NextResponse.json({ ok: true })
} catch (err) {
  return apiError(err)
 }
}
