import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-handler'

const EXEC_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']
const userSelect = { id: true, name: true, role: true } as const

async function canAccess(caseId: string, userId: string, role: string) {
  if (EXEC_ROLES.includes(role)) return true
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    select: { createdById: true, assignedEmployeeId: true },
  })
  return c?.createdById === userId || c?.assignedEmployeeId === userId
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const courts = await prisma.caseCourt.findMany({
    where:   { caseId: id },
    include: { createdBy: { select: userSelect } },
    orderBy: { courtDate: 'asc' },
  })
  return NextResponse.json({ courts })
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

  if (!await canAccess(id, session.user.id, session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { courtName, courtDate, appointmentTime, judgeName, result, note } = body
  if (!courtName?.trim()) return NextResponse.json({ error: 'กรุณาระบุชื่อศาล' }, { status: 400 })
  if (!courtDate)         return NextResponse.json({ error: 'กรุณาระบุวันนัด' }, { status: 400 })

  const court = await prisma.caseCourt.create({
    data: {
      caseId:          id,
      courtName:       courtName.trim(),
      courtDate:       new Date(courtDate),
      appointmentTime: appointmentTime?.trim() ?? null,
      judgeName:       judgeName?.trim()       ?? null,
      result:          result?.trim()          ?? null,
      note:            note?.trim()            ?? null,
      createdById:     session.user.id,
    },
    include: { createdBy: { select: userSelect } },
  })

  // Timeline
  await prisma.caseTimeline.create({
    data: {
      caseId:      id,
      userId:      session.user.id,
      action:      'court_added',
      description: `${session.user.name} เพิ่มนัดศาล: ${courtName.trim()} วันที่ ${new Date(courtDate).toLocaleDateString('th-TH')}`,
    },
  })

  return NextResponse.json({ court }, { status: 201 })
} catch (err) {
  return apiError(err)
 }
}
