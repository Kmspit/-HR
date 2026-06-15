import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

const EXEC_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; courtId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, courtId } = await params

  const existing = await prisma.caseCourt.findUnique({
    where: { id: courtId },
    include: { case: { select: { createdById: true, assignedEmployeeId: true } } },
  })
  if (!existing || existing.caseId !== id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const canEdit =
    EXEC_ROLES.includes(session.user.role) ||
    existing.createdById === session.user.id ||
    existing.case.createdById === session.user.id ||
    existing.case.assignedEmployeeId === session.user.id

  if (!canEdit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { courtName, courtDate, appointmentTime, judgeName, result, note } = body

  type CourtData = Record<string, unknown>
  const data: CourtData = {}
  if (courtName       !== undefined) data.courtName       = courtName?.trim()       ?? null
  if (courtDate       !== undefined) data.courtDate       = courtDate ? new Date(courtDate) : null
  if (appointmentTime !== undefined) data.appointmentTime = appointmentTime?.trim()  ?? null
  if (judgeName       !== undefined) data.judgeName       = judgeName?.trim()        ?? null
  if (result          !== undefined) data.result          = result?.trim()           ?? null
  if (note            !== undefined) data.note            = note?.trim()             ?? null

  const updated = await prisma.caseCourt.update({ where: { id: courtId }, data })
  return NextResponse.json({ court: updated })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; courtId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, courtId } = await params

  const existing = await prisma.caseCourt.findUnique({
    where: { id: courtId },
    include: { case: { select: { createdById: true, assignedEmployeeId: true } } },
  })
  if (!existing || existing.caseId !== id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const canDelete =
    EXEC_ROLES.includes(session.user.role) ||
    existing.createdById === session.user.id ||
    existing.case.createdById === session.user.id

  if (!canDelete) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.caseCourt.delete({ where: { id: courtId } })
  await prisma.caseTimeline.create({
    data: {
      caseId: id, userId: session.user.id,
      action: 'court_removed',
      description: `${session.user.name} ลบนัดศาล: ${existing.courtName}`,
    },
  })
  return NextResponse.json({ ok: true })
}
