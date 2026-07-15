import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-handler'

const CAN_MANAGE_ALL = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR']

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: taskId } = await params

  const task = await prisma.taskAssignment.findUnique({
    where: { id: taskId },
    select: { assigneeId: true, assignedById: true },
  })
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const canView =
    task.assigneeId === session.user.id ||
    task.assignedById === session.user.id ||
    CAN_MANAGE_ALL.includes(session.user.role)

  if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const timeline = await prisma.taskTimeline.findMany({
    where: { taskId },
    select: {
      id: true,
      action: true,
      description: true,
      meta: true,
      createdAt: true,
      user: { select: { id: true, name: true, role: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ timeline })
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
  const body = await req.json()
  const { action, description, meta } = body

  if (!action || !description) {
    return NextResponse.json({ error: 'action and description required' }, { status: 400 })
  }

  const task = await prisma.taskAssignment.findUnique({
    where: { id: taskId },
    select: { assigneeId: true, assignedById: true },
  })
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const canAct =
    task.assigneeId === session.user.id ||
    task.assignedById === session.user.id ||
    CAN_MANAGE_ALL.includes(session.user.role)

  if (!canAct) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const entry = await prisma.taskTimeline.create({
    data: {
      taskId,
      userId: session.user.id,
      action,
      description,
      meta: meta ? JSON.stringify(meta) : null,
    },
    select: {
      id: true, action: true, description: true, meta: true, createdAt: true,
      user: { select: { id: true, name: true, role: true } },
    },
  })

  return NextResponse.json({ entry }, { status: 201 })
} catch (err) {
  return apiError(err)
 }
}
