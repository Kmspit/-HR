import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { createNotification } from '@/lib/notifications'

const CAN_ASSIGN = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']
const CAN_SEE_ALL = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR']

const userSelect = {
  id: true,
  name: true,
  department: true,
  employeeId: true,
  role: true,
} as const

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? undefined
  const view = searchParams.get('view') ?? 'mine' // 'mine' | 'assigned_by_me' | 'all'

  const role = session.user.role
  const userId = session.user.id

  let where: Record<string, unknown> = {}

  if (view === 'all' && CAN_SEE_ALL.includes(role)) {
    // HR/CEO see everything
    where = {}
  } else if (view === 'assigned_by_me') {
    where = { assignedById: userId }
  } else {
    // Default: own tasks (assigned to me)
    where = { assigneeId: userId }
  }

  if (status) where.status = status

  const tasks = await prisma.taskAssignment.findMany({
    where,
    include: {
      assignee:   { select: userSelect },
      assignedBy: { select: userSelect },
    },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    take: 100,
  })

  return NextResponse.json({ tasks })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!CAN_ASSIGN.includes(session.user.role)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์มอบหมายงาน' }, { status: 403 })
  }

  const body = await req.json()
  const { title, description, type, priority, assigneeId, startDate, dueDate, notes } = body

  if (!title?.trim()) return NextResponse.json({ error: 'กรุณาระบุชื่องาน' }, { status: 400 })
  if (!assigneeId)    return NextResponse.json({ error: 'กรุณาเลือกผู้รับผิดชอบ' }, { status: 400 })

  // TEAM_LEADER can only assign to their own team
  if (session.user.role === 'TEAM_LEADER') {
    const member = await prisma.user.findUnique({
      where: { id: assigneeId },
      select: { teamLeaderId: true },
    })
    if (member?.teamLeaderId !== session.user.id) {
      return NextResponse.json({ error: 'สามารถมอบหมายงานได้เฉพาะสมาชิกในทีม' }, { status: 403 })
    }
  }

  // MANAGER can only assign to their managed users
  if (session.user.role === 'MANAGER') {
    const member = await prisma.user.findUnique({
      where: { id: assigneeId },
      select: { managerId: true },
    })
    if (member?.managerId !== session.user.id) {
      return NextResponse.json({ error: 'สามารถมอบหมายงานได้เฉพาะพนักงานในทีม' }, { status: 403 })
    }
  }

  const task = await prisma.taskAssignment.create({
    data: {
      title: title.trim(),
      description: description?.trim() ?? null,
      type: type ?? 'OFFICE',
      priority: priority ?? 'MEDIUM',
      status: 'PENDING',
      assigneeId,
      assignedById: session.user.id,
      startDate: startDate ? new Date(startDate) : null,
      dueDate: dueDate ? new Date(dueDate) : null,
      notes: notes?.trim() ?? null,
    },
    include: {
      assignee:   { select: userSelect },
      assignedBy: { select: userSelect },
    },
  })

  // Notify the assignee
  await createNotification({
    userId: assigneeId,
    type: 'TASK_ASSIGNED',
    title: '📋 ได้รับมอบหมายงานใหม่',
    message: `${session.user.name} มอบหมายงาน: ${title.trim()}`,
    link: '/tasks',
  })

  return NextResponse.json({ task }, { status: 201 })
}
