import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-handler'

const EXEC_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  // Same case-access check as this file's own POST handler (and
  // app/api/cases/[id]/risk/route.ts) — GET had no check at all, letting
  // any authenticated user read any case's full activity timeline.
  const c = await prisma.case.findUnique({
    where:  { id },
    select: { createdById: true, assignedEmployeeId: true, department: true },
  })
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const canAccess =
    EXEC_ROLES.includes(session.user.role) ||
    c.createdById === session.user.id ||
    c.assignedEmployeeId === session.user.id

  if (!canAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const timeline = await prisma.caseTimeline.findMany({
    where:   { caseId: id },
    include: { user: { select: { id: true, name: true, role: true } } },
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
  const { id } = await params

  // Check access
  const c = await prisma.case.findUnique({
    where:  { id },
    select: { createdById: true, assignedEmployeeId: true, department: true },
  })
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const canAccess =
    EXEC_ROLES.includes(session.user.role) ||
    c.createdById === session.user.id ||
    c.assignedEmployeeId === session.user.id

  if (!canAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { description } = await req.json()
  if (!description?.trim()) return NextResponse.json({ error: 'กรุณาระบุรายละเอียด' }, { status: 400 })

  const entry = await prisma.caseTimeline.create({
    data: {
      caseId:      id,
      userId:      session.user.id,
      action:      'comment_added',
      description: description.trim(),
    },
    include: { user: { select: { id: true, name: true, role: true } } },
  })
  return NextResponse.json({ entry }, { status: 201 })
} catch (err) {
  return apiError(err)
 }
}
