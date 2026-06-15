import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { createNotification, sendLineMessage } from '@/lib/notifications'

const EXEC_ROLES  = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']
const MANAGE_ROLES = [...EXEC_ROLES, 'MANAGER', 'TEAM_LEADER']

const userSelect = { id: true, name: true, department: true, employeeId: true, role: true } as const

async function canAccess(caseId: string, userId: string, role: string, department?: string | null) {
  if (EXEC_ROLES.includes(role)) return true
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    select: { createdById: true, assignedEmployeeId: true, department: true },
  })
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

  const c = await prisma.case.findUnique({
    where: { id },
    include: {
      assignedEmployee: { select: userSelect },
      createdBy:        { select: userSelect },
      client:           true,
      debtor:           true,
      courts:           { orderBy: { courtDate: 'asc' }, include: { createdBy: { select: userSelect } } },
      timeline:         { orderBy: { createdAt: 'asc' }, include: { user: { select: { id: true, name: true } } }, take: 50 },
      tasks:            {
        select: {
          id: true, title: true, status: true, priority: true, dueDate: true,
          assignee: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
      },
      _count: { select: { tasks: true, courts: true } },
    },
  })

  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ case: c })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  if (!await canAccess(id, session.user.id, session.user.role, session.user.department)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const existing = await prisma.case.findUnique({ where: { id }, select: { status: true, assignedEmployeeId: true, caseNumber: true, caseTitle: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const {
    caseTitle, caseType, status, priority, description, debtAmount,
    department, assignedEmployeeId, dueDate, closedAt,
    client, debtor,
  } = body

  type CaseData = Record<string, unknown>
  const data: CaseData = {}
  if (caseTitle     !== undefined) data.caseTitle     = caseTitle?.trim()
  if (caseType      !== undefined) data.caseType      = caseType
  if (status        !== undefined) data.status        = status
  if (priority      !== undefined) data.priority      = priority
  if (description   !== undefined) data.description   = description?.trim() ?? null
  if (debtAmount    !== undefined) data.debtAmount    = debtAmount != null ? Number(debtAmount) : null
  if (department    !== undefined) data.department    = department ?? null
  if (assignedEmployeeId !== undefined) data.assignedEmployeeId = assignedEmployeeId ?? null
  if (dueDate       !== undefined) data.dueDate       = dueDate ? new Date(dueDate) : null
  if (closedAt      !== undefined) data.closedAt      = closedAt ? new Date(closedAt) : null

  const updated = await prisma.case.update({
    where: { id },
    data,
    include: {
      assignedEmployee: { select: userSelect },
      createdBy:        { select: userSelect },
      client:           true,
      debtor:           true,
    },
  })

  // Update nested client
  if (client !== undefined) {
    await prisma.caseClient.upsert({
      where:  { caseId: id },
      create: { caseId: id, ...sanitizeClient(client) },
      update: sanitizeClient(client),
    })
  }

  // Update nested debtor
  if (debtor !== undefined) {
    await prisma.caseDebtor.upsert({
      where:  { caseId: id },
      create: { caseId: id, ...sanitizeDebtor(debtor) },
      update: sanitizeDebtor(debtor),
    })
  }

  // Timeline entries
  const timelineEntries: { action: string; description: string; meta?: string }[] = []

  if (status !== undefined && status !== existing.status) {
    timelineEntries.push({
      action: 'status_changed',
      description: `${session.user.name} เปลี่ยนสถานะเป็น ${status}`,
      meta: JSON.stringify({ oldStatus: existing.status, newStatus: status }),
    })
    // Notify on COMPLETED/CANCELLED
    if (['COMPLETED', 'CANCELLED'].includes(status) && existing.assignedEmployeeId) {
      await createNotification({
        userId:  existing.assignedEmployeeId,
        type:    'CASE_STATUS_CHANGED',
        title:   `📁 คดี${status === 'COMPLETED' ? 'เสร็จสิ้น' : 'ยกเลิก'}`,
        message: `${existing.caseNumber}: ${existing.caseTitle} — สถานะ: ${status}`,
        link:    `/cases/${id}`,
      })
    }
  }

  if (assignedEmployeeId !== undefined && assignedEmployeeId !== existing.assignedEmployeeId && assignedEmployeeId) {
    timelineEntries.push({
      action: 'assigned',
      description: `${session.user.name} มอบหมายคดีให้พนักงาน`,
    })
    await createNotification({
      userId:  assignedEmployeeId,
      type:    'CASE_ASSIGNED',
      title:   '📁 ได้รับมอบหมายคดี',
      message: `${existing.caseNumber}: ${existing.caseTitle}`,
      link:    `/cases/${id}`,
    })
    const emp = await prisma.user.findUnique({ where: { id: assignedEmployeeId }, select: { lineUserId: true } })
    if (emp?.lineUserId) {
      await sendLineMessage(assignedEmployeeId, `📁 ได้รับมอบหมายคดี\n${existing.caseNumber}: ${existing.caseTitle}`)
    }
  }

  for (const entry of timelineEntries) {
    await prisma.caseTimeline.create({
      data: { caseId: id, userId: session.user.id, ...entry },
    })
  }

  return NextResponse.json({ case: updated })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  if (!MANAGE_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Soft-delete: set status to CANCELLED
  await prisma.case.update({
    where: { id },
    data:  { status: 'CANCELLED', closedAt: new Date() },
  })
  await prisma.caseTimeline.create({
    data: {
      caseId: id, userId: session.user.id,
      action: 'cancelled', description: `${session.user.name} ยกเลิกคดี`,
    },
  })
  return NextResponse.json({ ok: true })
}

function sanitizeClient(c: Record<string, string>) {
  return {
    clientName:    c.clientName?.trim()    ?? null,
    companyName:   c.companyName?.trim()   ?? null,
    taxId:         c.taxId?.trim()         ?? null,
    phone:         c.phone?.trim()         ?? null,
    email:         c.email?.trim()         ?? null,
    address:       c.address?.trim()       ?? null,
    contactPerson: c.contactPerson?.trim() ?? null,
    note:          c.note?.trim()          ?? null,
  }
}

function sanitizeDebtor(d: Record<string, string>) {
  return {
    fullName:  d.fullName?.trim()  ?? '',
    idCard:    d.idCard?.trim()    ?? null,
    phone:     d.phone?.trim()     ?? null,
    email:     d.email?.trim()     ?? null,
    address:   d.address?.trim()   ?? null,
    workplace: d.workplace?.trim() ?? null,
    riskLevel: d.riskLevel         ?? 'MEDIUM',
    assetInfo: d.assetInfo?.trim() ?? null,
    note:      d.note?.trim()      ?? null,
  }
}
