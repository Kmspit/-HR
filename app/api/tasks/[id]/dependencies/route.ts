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

  const { id } = await params

  const [dependencies, dependents] = await Promise.all([
    prisma.taskDependency.findMany({
      where: { taskId: id },
      include: {
        dependsOn: {
          select: {
            id: true, title: true, status: true, priority: true,
            dueDate: true, assignee: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.taskDependency.findMany({
      where: { dependsOnId: id },
      include: {
        task: {
          select: {
            id: true, title: true, status: true, priority: true,
            dueDate: true, assignee: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  return NextResponse.json({ dependencies, dependents })
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

  const { id } = await params
  const body = await req.json()
  const { dependsOnId } = body

  if (!dependsOnId) return NextResponse.json({ error: 'กรุณาระบุงานที่ต้องทำก่อน' }, { status: 400 })
  if (dependsOnId === id) return NextResponse.json({ error: 'งานไม่สามารถขึ้นต่อตัวเอง' }, { status: 400 })

  const [task, dependsOn] = await Promise.all([
    prisma.taskAssignment.findUnique({ where: { id } }),
    prisma.taskAssignment.findUnique({ where: { id: dependsOnId } }),
  ])

  if (!task)      return NextResponse.json({ error: 'ไม่พบงาน' }, { status: 404 })
  if (!dependsOn) return NextResponse.json({ error: 'ไม่พบงานที่ต้องทำก่อน' }, { status: 404 })

  const canEdit =
    task.assignedById === session.user.id ||
    task.assigneeId   === session.user.id ||
    CAN_MANAGE_ALL.includes(session.user.role)

  if (!canEdit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Circular dependency check — simple 1-level check
  const reverseExists = await prisma.taskDependency.findFirst({
    where: { taskId: dependsOnId, dependsOnId: id },
  })
  if (reverseExists) return NextResponse.json({ error: 'ไม่สามารถสร้าง dependency แบบวนซ้ำ' }, { status: 409 })

  const dep = await prisma.taskDependency.upsert({
    where:  { taskId_dependsOnId: { taskId: id, dependsOnId } },
    update: {},
    create: { taskId: id, dependsOnId },
    include: {
      dependsOn: {
        select: { id: true, title: true, status: true, priority: true },
      },
    },
  })

  return NextResponse.json({ dependency: dep }, { status: 201 })
} catch (err) {
  return apiError(err)
 }
}
