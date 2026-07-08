import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { requireCsrf } from '@/lib/api-guard'

const EXEC_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

async function canAccess(caseId: string, userId: string, role: string, department?: string | null) {
  if (EXEC_ROLES.includes(role)) return true
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { createdById: true, assignedEmployeeId: true, department: true } })
  if (!c) return false
  if (role === 'MANAGER' && department && c.department === department) return true
  return c.createdById === userId || c.assignedEmployeeId === userId
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  if (!await canAccess(id, session.user.id, session.user.role, session.user.department)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const checklists = await prisma.caseChecklist.findMany({
    where: { caseId: id },
    include: { doneBy: { select: { id: true, name: true } } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
  return NextResponse.json({ checklists })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  if (!await canAccess(id, session.user.id, session.user.role, session.user.department)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { action, checklistId, label, required, sortOrder } = body

  // Toggle an existing item
  if (action === 'toggle' && checklistId) {
    const item = await prisma.caseChecklist.findUnique({ where: { id: checklistId } })
    if (!item || item.caseId !== id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const updated = await prisma.caseChecklist.update({
      where: { id: checklistId },
      data: {
        done:    !item.done,
        doneAt:  !item.done ? new Date() : null,
        doneById: !item.done ? session.user.id : null,
      },
    })

    await prisma.caseTimeline.create({
      data: {
        caseId:      id,
        userId:      session.user.id,
        action:      updated.done ? 'checklist_done' : 'checklist_undone',
        description: `${session.user.name} ${updated.done ? 'ทำเสร็จ' : 'ยกเลิก'}: ${item.label}`,
      },
    })
    return NextResponse.json({ item: updated })
  }

  // Add new item
  if (!label?.trim()) return NextResponse.json({ error: 'กรุณาระบุรายการ' }, { status: 400 })
  const item = await prisma.caseChecklist.create({
    data: {
      caseId:    id,
      label:     label.trim(),
      required:  required ?? false,
      sortOrder: sortOrder ?? 0,
    },
  })
  return NextResponse.json({ item }, { status: 201 })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrfErr = requireCsrf(req)
  if (csrfErr) return csrfErr

  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  if (!await canAccess(id, session.user.id, session.user.role, session.user.department)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const checklistId = searchParams.get('checklistId')
  if (!checklistId) return NextResponse.json({ error: 'checklistId required' }, { status: 400 })

  await prisma.caseChecklist.deleteMany({ where: { id: checklistId, caseId: id } })
  return NextResponse.json({ ok: true })
}
