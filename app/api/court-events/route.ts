import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { triggerAutomation } from '@/lib/automation-engine'
import { requireCsrf } from '@/lib/api-guard'

const EXEC_ROLES  = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']
const LEGAL_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'LAWYER', 'ENFORCEMENT', 'TEAM_LEADER']

function buildAccessWhere(role: string, userId: string, department: string | null | undefined) {
  if (EXEC_ROLES.includes(role)) return {}
  if (role === 'MANAGER' && department) {
    return { case: { department } }
  }
  return {
    OR: [
      { createdById: userId },
      { assignedLawyerId: userId },
    ],
  }
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!LEGAL_ROLES.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = req.nextUrl
  const caseId          = searchParams.get('caseId')
  const lawyerId        = searchParams.get('lawyerId')
  const status          = searchParams.get('status')
  const courtType       = searchParams.get('courtType')
  const appointmentType = searchParams.get('appointmentType')
  const priority        = searchParams.get('priority')
  const from            = searchParams.get('from')
  const to              = searchParams.get('to')
  const page            = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit           = Math.min(100, parseInt(searchParams.get('limit') ?? '50'))

  const accessWhere = buildAccessWhere(session.user.role, session.user.id, session.user.department)

  const where: Record<string, unknown> = { ...accessWhere }
  if (caseId)          where.caseId          = caseId
  if (lawyerId)        where.assignedLawyerId = lawyerId
  if (status)          where.status           = status
  if (courtType)       where.courtType        = courtType
  if (appointmentType) where.appointmentType  = appointmentType
  if (priority)        where.priority         = priority
  if (from || to) {
    where.appointmentDate = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to   ? { lte: new Date(to)   } : {}),
    }
  }

  const [events, total] = await Promise.all([
    prisma.courtEvent.findMany({
      where,
      include: {
        case:           { select: { id: true, caseNumber: true, caseTitle: true, caseType: true, status: true, department: true } },
        assignedLawyer: { select: { id: true, name: true, role: true } },
        createdBy:      { select: { id: true, name: true, role: true } },
      },
      orderBy: { appointmentDate: 'asc' },
      skip:  (page - 1) * limit,
      take:  limit,
    }),
    prisma.courtEvent.count({ where }),
  ])

  return NextResponse.json({ events, total, page, pages: Math.ceil(total / limit) })
}

export async function POST(req: NextRequest) {
  const csrfErr = requireCsrf(req)
  if (csrfErr) return csrfErr

  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!LEGAL_ROLES.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const {
    caseId, courtName, courtType, appointmentType,
    appointmentDate, appointmentTime, location, judgeName,
    roomNumber, appointmentNumber, status, priority,
    assignedLawyerId, assignedTeamId, note, documentId,
  } = body

  if (!caseId)          return NextResponse.json({ error: 'caseId required' }, { status: 400 })
  if (!courtName?.trim()) return NextResponse.json({ error: 'courtName required' }, { status: 400 })
  if (!appointmentDate) return NextResponse.json({ error: 'appointmentDate required' }, { status: 400 })

  const event = await prisma.courtEvent.create({
    data: {
      caseId,
      courtName:         courtName.trim(),
      courtType:         courtType         ?? 'CIVIL',
      appointmentType:   appointmentType   ?? 'HEARING',
      appointmentDate:   new Date(appointmentDate),
      appointmentTime:   appointmentTime   ?? null,
      location:          location          ?? null,
      judgeName:         judgeName         ?? null,
      roomNumber:        roomNumber        ?? null,
      appointmentNumber: appointmentNumber ?? null,
      status:            status            ?? 'SCHEDULED',
      priority:          priority          ?? 'NORMAL',
      assignedLawyerId:  assignedLawyerId  ?? null,
      assignedTeamId:    assignedTeamId    ?? null,
      note:              note              ?? null,
      documentId:        documentId        ?? null,
      createdById:       session.user.id,
    },
    include: {
      case:           { select: { id: true, caseNumber: true, caseTitle: true } },
      assignedLawyer: { select: { id: true, name: true } },
      createdBy:      { select: { id: true, name: true } },
    },
  })

  triggerAutomation('COURT_CREATED', {
    courtEventId:     event.id,
    caseId:           event.caseId,
    caseNumber:       event.case.caseNumber,
    courtName:        event.courtName,
    courtType:        event.courtType,
    appointmentType:  event.appointmentType,
    appointmentDate:  event.appointmentDate.toISOString(),
    priority:         event.priority,
    assignedLawyerId: event.assignedLawyerId,
  }, session.user.id).catch(() => undefined)

  return NextResponse.json(event, { status: 201 })
}
