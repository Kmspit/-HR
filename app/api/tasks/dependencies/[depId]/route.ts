import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

const CAN_MANAGE_ALL = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR']

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ depId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { depId } = await params
  const dep = await prisma.taskDependency.findUnique({
    where: { id: depId },
    include: { task: { select: { assignedById: true, assigneeId: true } } },
  })
  if (!dep) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const canDelete =
    dep.task.assignedById === session.user.id ||
    dep.task.assigneeId   === session.user.id ||
    CAN_MANAGE_ALL.includes(session.user.role)

  if (!canDelete) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.taskDependency.delete({ where: { id: depId } })
  return NextResponse.json({ ok: true })
}
