import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { createNotification } from '@/lib/notifications'

const CAN_ADD = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER', 'EMPLOYEE', 'LAWYER', 'ENFORCEMENT']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const history = await prisma.caseStatusHistory.findMany({
    where: { taskId: id },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(history)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!CAN_ADD.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: taskId } = await params
  const task = await prisma.taskAssignment.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, clientId: true, caseNumber: true },
  })
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const body = await req.json()
  const { status, note } = body
  if (!status?.trim()) return NextResponse.json({ error: 'status required' }, { status: 400 })

  const entry = await prisma.caseStatusHistory.create({
    data: {
      taskId,
      status:        status.trim(),
      note:          note?.trim() ?? null,
      changedById:   session.user.id,
      changedByName: session.user.name ?? '',
    },
  })

  // Notify client if linked
  if (task.clientId) {
    await createNotification({
      userId:  task.clientId,
      type:    'TASK_ASSIGNED',
      title:   'อัพเดทสถานะคดี',
      message: `คดี "${task.title}"${task.caseNumber ? ` (${task.caseNumber})` : ''} มีการอัพเดทสถานะ: ${status}`,
      link:    `/client-portal/cases/${taskId}`,
    })
  }

  return NextResponse.json(entry, { status: 201 })
}
