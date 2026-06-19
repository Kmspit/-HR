import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { createNotification, sendLineMessage } from '@/lib/notifications'
import { calcSlaDeadline } from '@/lib/task-sla'

const CAN_ASSIGN  = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']
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
  const status    = searchParams.get('status')    ?? undefined
  const view      = searchParams.get('view')      ?? 'mine' // 'mine' | 'assigned_by_me' | 'all'
  const search    = searchParams.get('search')    ?? undefined
  const filter    = searchParams.get('filter')    ?? undefined // 'overdue' | 'high_priority' | 'due_today' | 'due_week' | 'my_team'
  const priority  = searchParams.get('priority')  ?? undefined
  const dept      = searchParams.get('department')  ?? undefined
  const page      = Math.max(1, parseInt(searchParams.get('page')  ?? '1'))
  const limit     = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50')))

  const role   = session.user.role
  const userId = session.user.id
  const now    = new Date()

  type Where = Record<string, unknown>
  let where: Where = {}

  if (view === 'all' && CAN_SEE_ALL.includes(role)) {
    where = {}
  } else if (view === 'assigned_by_me') {
    where = { assignedById: userId }
  } else if (view === 'my_team') {
    // Manager: their managed users; Team leader: team members; others: own
    if (role === 'MANAGER') {
      const managed = await prisma.user.findMany({ where: { managerId: userId }, select: { id: true } })
      where = { assigneeId: { in: managed.map(u => u.id) } }
    } else if (role === 'TEAM_LEADER') {
      const members = await prisma.user.findMany({ where: { teamLeaderId: userId }, select: { id: true } })
      where = { assigneeId: { in: members.map(u => u.id) } }
    } else {
      where = { assigneeId: userId }
    }
  } else {
    where = { assigneeId: userId }
  }

  if (status)   where.status   = status
  if (priority) where.priority = priority
  if (dept)     where.taskDepartment = dept

  // Smart filters
  if (filter === 'overdue') {
    where.dueDate = { lt: now }
    where.status  = { notIn: ['COMPLETED', 'CANCELLED', 'REJECTED'] }
  } else if (filter === 'high_priority') {
    where.priority = { in: ['HIGH', 'URGENT'] }
    where.status   = { notIn: ['COMPLETED', 'CANCELLED', 'REJECTED'] }
  } else if (filter === 'due_today') {
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const endOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    where.dueDate = { gte: startOfDay, lt: endOfDay }
    where.status  = { notIn: ['COMPLETED', 'CANCELLED', 'REJECTED'] }
  } else if (filter === 'due_week') {
    const endOfWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    where.dueDate = { gte: now, lte: endOfWeek }
    where.status  = { notIn: ['COMPLETED', 'CANCELLED', 'REJECTED'] }
  } else if (filter === 'my_team') {
    const teamIds: string[] = []
    if (role === 'MANAGER') {
      const managed = await prisma.user.findMany({ where: { managerId: userId }, select: { id: true } })
      teamIds.push(...managed.map(u => u.id))
    } else if (role === 'TEAM_LEADER') {
      const members = await prisma.user.findMany({ where: { teamLeaderId: userId }, select: { id: true } })
      teamIds.push(...members.map(u => u.id))
    }
    if (teamIds.length > 0) where.assigneeId = { in: teamIds }
  }

  // Full-text search across title, caseNumber, clientName
  if (search?.trim()) {
    where.OR = [
      { title:      { contains: search.trim() } },
      { caseNumber: { contains: search.trim() } },
      { clientName: { contains: search.trim() } },
    ]
  }

  const [tasks, total] = await Promise.all([
    prisma.taskAssignment.findMany({
      where,
      include: {
        assignee:    { select: userSelect },
        assignedBy:  { select: userSelect },
        attachments: {
          include: { uploadedBy: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.taskAssignment.count({ where }),
  ])

  // Compute isBlocked: has unresolved dependency (prerequisite not COMPLETED)
  const taskIds = tasks.map((t) => t.id)
  let blockedIds = new Set<string>()
  if (taskIds.length > 0) {
    const deps = await prisma.taskDependency.findMany({
      where: { taskId: { in: taskIds } },
      select: { taskId: true, dependsOn: { select: { status: true } } },
    })
    blockedIds = new Set(
      deps.filter((d) => d.dependsOn.status !== 'COMPLETED').map((d) => d.taskId)
    )
  }

  const tasksWithBlocked = tasks.map((t) => ({ ...t, isBlocked: blockedIds.has(t.id) }))
  return NextResponse.json({ tasks: tasksWithBlocked, total, page, pages: Math.ceil(total / limit) })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!CAN_ASSIGN.includes(session.user.role)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์มอบหมายงาน' }, { status: 403 })
  }

  const body = await req.json()
  const {
    title, description, type, priority, assigneeId, startDate, dueDate, notes, taskLinks,
    caseNumber, clientName, taskDepartment, appointmentDate, courtDate, appointmentPlace,
    checklist,
    dueTime, slaHours,
    templateId, debtorId,
  } = body

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

  // Validate taskLinks is array of {label, url}
  let taskLinksJson: string | null = null
  if (Array.isArray(taskLinks) && taskLinks.length > 0) {
    const clean = taskLinks
      .filter((l: unknown) => l && typeof l === 'object')
      .map((l: Record<string, string>) => ({ label: String(l.label ?? '').trim(), url: String(l.url ?? '').trim() }))
      .filter(l => l.url)
    taskLinksJson = clean.length > 0 ? JSON.stringify(clean) : null
  }

  // SLA deadline
  const slaHoursNum = slaHours ? Number(slaHours) : null
  const slaDeadlineValue = slaHoursNum ? calcSlaDeadline(new Date(), slaHoursNum) : null

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
      taskLinks: taskLinksJson,
      caseNumber:       caseNumber?.trim()       ?? null,
      clientName:       clientName?.trim()       ?? null,
      taskDepartment:   taskDepartment           ?? null,
      appointmentDate:  appointmentDate ? new Date(appointmentDate) : null,
      courtDate:        courtDate       ? new Date(courtDate)       : null,
      appointmentPlace: appointmentPlace?.trim() ?? null,
      dueTime:      dueTime?.trim()   ?? null,
      slaHours:     slaHoursNum,
      slaDeadline:  slaDeadlineValue,
      templateId:   templateId        ?? null,
      debtorId:     debtorId          ?? null,
    },
    include: {
      assignee:    { select: userSelect },
      assignedBy:  { select: userSelect },
      attachments: {
        include: { uploadedBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  // Create checklist items if provided
  if (Array.isArray(checklist) && checklist.length > 0) {
    const checklistData = checklist
      .filter((item: { title?: string }) => item?.title?.trim())
      .map((item: { title: string }, idx: number) => ({
        taskId: task.id,
        title: item.title.trim(),
        order: idx,
      }))
    if (checklistData.length > 0) {
      await prisma.taskChecklist.createMany({ data: checklistData })
    }
  }

  // Auto-create CalendarEvent for court/appointment dates (calendar sync)
  if (courtDate || appointmentDate) {
    const eventDate = courtDate ? new Date(courtDate) : new Date(appointmentDate)
    const eventTitle = courtDate
      ? `นัดศาล: ${title.trim()}${caseNumber ? ` [${caseNumber}]` : ''}`
      : `นัดหมาย: ${title.trim()}${clientName ? ` (${clientName})` : ''}`
    await prisma.calendarEvent.create({
      data: {
        title:       eventTitle,
        eventType:   courtDate ? 'COURT' : 'APPOINTMENT',
        startAt:     eventDate,
        caseNumber:  caseNumber?.trim()  ?? null,
        clientName:  clientName?.trim()  ?? null,
        description: `งาน: ${title.trim()}`,
        location:    appointmentPlace?.trim() ?? null,
        priority:    priority ?? 'MEDIUM',
        department:  taskDepartment ?? null,
        createdById: session.user.id,
        status:      'SCHEDULED',
      },
    }).catch(() => {})
  }

  // Record initial timeline entry
  await prisma.taskTimeline.create({
    data: {
      taskId:      task.id,
      userId:      session.user.id,
      action:      'created',
      description: `${session.user.name} สร้างงาน: ${title.trim()}`,
      meta:        JSON.stringify({ status: 'PENDING', priority: priority ?? 'MEDIUM' }),
    },
  })

  // Notify assignee (in-app)
  await createNotification({
    userId: assigneeId,
    type: 'TASK_ASSIGNED',
    title: '📋 ได้รับมอบหมายงานใหม่',
    message: `${session.user.name} มอบหมายงาน: ${title.trim()}`,
    link: '/tasks',
  })

  // LINE OA notification to assignee
  const assignee = await prisma.user.findUnique({
    where: { id: assigneeId },
    select: { lineUserId: true, name: true },
  })
  if (assignee?.lineUserId) {
    const dueDateStr = dueDate
      ? `\nกำหนดส่ง: ${new Date(dueDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}`
      : ''
    await sendLineMessage(
      assigneeId,
      `📋 งานใหม่ถูกมอบหมายให้คุณ\n\n${title.trim()}\nมอบหมายโดย: ${session.user.name}${dueDateStr}\nดูรายละเอียดได้ในแอป HRFlow`,
    )
  }

  return NextResponse.json({ task }, { status: 201 })
}
