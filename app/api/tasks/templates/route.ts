import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

const CAN_MANAGE = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const category   = searchParams.get('category')   ?? undefined
  const department = searchParams.get('department')  ?? undefined

  const templates = await prisma.taskTemplate.findMany({
    where: {
      isActive: true,
      ...(category   ? { category }   : {}),
      ...(department ? { department }  : {}),
    },
    include: { createdBy: { select: { id: true, name: true } } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  })

  return NextResponse.json({ templates })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!CAN_MANAGE.includes(session.user.role))
    return NextResponse.json({ error: 'ไม่มีสิทธิ์สร้างเทมเพลต' }, { status: 403 })

  const body = await req.json()
  const {
    name, description, category, taskType, priority,
    defaultSlaHours, defaultChecklist, defaultAssigneeRole,
    department, notes, sortOrder,
  } = body

  if (!name?.trim()) return NextResponse.json({ error: 'กรุณาระบุชื่อเทมเพลต' }, { status: 400 })

  const checklist = Array.isArray(defaultChecklist)
    ? JSON.stringify(defaultChecklist.filter((i: { title?: string }) => i?.title?.trim()))
    : '[]'

  const template = await prisma.taskTemplate.create({
    data: {
      name:               name.trim(),
      description:        description?.trim() ?? null,
      category:           category            ?? 'GENERAL',
      taskType:           taskType            ?? null,
      priority:           priority            ?? 'MEDIUM',
      defaultSlaHours:    defaultSlaHours ? Number(defaultSlaHours) : null,
      defaultChecklist:   checklist,
      defaultAssigneeRole: defaultAssigneeRole ?? null,
      department:         department          ?? null,
      notes:              notes?.trim()       ?? null,
      sortOrder:          sortOrder ? Number(sortOrder) : 0,
      createdById:        session.user.id,
    },
    include: { createdBy: { select: { id: true, name: true } } },
  })

  return NextResponse.json({ template }, { status: 201 })
}
