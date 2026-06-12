import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { createNotification } from '@/lib/notifications'

const CAN_MANAGE_ALL = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR']

const commentSelect = {
  id: true,
  content: true,
  parentId: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, name: true, role: true, department: true } },
  replies: {
    select: {
      id: true,
      content: true,
      parentId: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { id: true, name: true, role: true, department: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: taskId } = await params

  const task = await prisma.taskAssignment.findUnique({ where: { id: taskId }, select: { assigneeId: true, assignedById: true } })
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const canView =
    task.assigneeId === session.user.id ||
    task.assignedById === session.user.id ||
    CAN_MANAGE_ALL.includes(session.user.role)

  if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const comments = await prisma.taskComment.findMany({
    where: { taskId, parentId: null },
    select: commentSelect,
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ comments })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: taskId } = await params
  const body = await req.json()
  const { content, parentId } = body

  if (!content?.trim()) return NextResponse.json({ error: 'กรุณาระบุข้อความ' }, { status: 400 })

  const task = await prisma.taskAssignment.findUnique({
    where: { id: taskId },
    select: { assigneeId: true, assignedById: true, title: true },
  })
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const canComment =
    task.assigneeId === session.user.id ||
    task.assignedById === session.user.id ||
    CAN_MANAGE_ALL.includes(session.user.role)

  if (!canComment) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const comment = await prisma.taskComment.create({
    data: {
      taskId,
      userId: session.user.id,
      content: content.trim(),
      parentId: parentId ?? null,
    },
    select: commentSelect,
  })

  // Notify the other party (if assignee comments → notify assigner; if assigner comments → notify assignee)
  const notifyUserId = session.user.id === task.assigneeId ? task.assignedById : task.assigneeId
  if (notifyUserId !== session.user.id) {
    await createNotification({
      userId: notifyUserId,
      type: 'TASK_SUBMITTED',
      title: '💬 มีความคิดเห็นใหม่',
      message: `${session.user.name} แสดงความคิดเห็นในงาน: ${task.title}`,
      link: '/tasks',
    })
  }

  return NextResponse.json({ comment }, { status: 201 })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: taskId } = await params
  const { searchParams } = new URL(req.url)
  const commentId = searchParams.get('commentId')
  if (!commentId) return NextResponse.json({ error: 'commentId required' }, { status: 400 })

  const comment = await prisma.taskComment.findUnique({ where: { id: commentId } })
  if (!comment || comment.taskId !== taskId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const canDelete =
    comment.userId === session.user.id ||
    CAN_MANAGE_ALL.includes(session.user.role)

  if (!canDelete) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.taskComment.delete({ where: { id: commentId } })
  return NextResponse.json({ ok: true })
}
