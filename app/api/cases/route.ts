import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { createNotification, sendLineMessage } from '@/lib/notifications'
import { triggerAutomation } from '@/lib/automation-engine'
import { apiError } from '@/lib/api-handler'

const EXEC_ROLES  = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']
const CAN_CREATE  = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER', 'LAWYER', 'ENFORCEMENT']

const userSelect = { id: true, name: true, department: true, employeeId: true, role: true } as const

function buildWhere(user: { id: string; role: string; department?: string | null }) {
  if (EXEC_ROLES.includes(user.role)) return {}
  if (user.role === 'MANAGER' && user.department) return { department: user.department }
  return { OR: [{ assignedEmployeeId: user.id }, { createdById: user.id }] }
}

export async function GET(req: Request) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status   = searchParams.get('status')   ?? undefined
  const type     = searchParams.get('type')     ?? undefined
  const priority = searchParams.get('priority') ?? undefined
  const dept     = searchParams.get('department') ?? undefined
  const search   = searchParams.get('search')   ?? undefined
  const assignee = searchParams.get('assignee') ?? undefined

  const baseWhere = buildWhere(session.user)

  type WhereExtra = Record<string, unknown>
  const extra: WhereExtra = {}
  if (status)   extra.status   = status
  if (type)     extra.caseType = type
  if (priority) extra.priority = priority
  if (dept)     extra.department = dept
  if (assignee) extra.assignedEmployeeId = assignee

  if (search?.trim()) {
    extra.OR = [
      { caseNumber: { contains: search.trim() } },
      { caseTitle:  { contains: search.trim() } },
      { client:     { OR: [{ clientName: { contains: search.trim() } }, { companyName: { contains: search.trim() } }] } },
      { debtor:     { OR: [{ fullName: { contains: search.trim() } }, { phone: { contains: search.trim() } }] } },
    ]
  }

  const where = Object.keys(baseWhere).length === 0 ? extra : { AND: [baseWhere, extra] }

  const cases = await prisma.case.findMany({
    where,
    include: {
      assignedEmployee: { select: userSelect },
      createdBy:        { select: userSelect },
      client:           { select: { clientName: true, companyName: true, phone: true } },
      debtor:           { select: { fullName: true, phone: true, riskLevel: true } },
      _count:           { select: { tasks: true, courts: true } },
    },
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
    take: 200,
  })

  return NextResponse.json({ cases })
} catch (err) {
  return apiError(err)
 }
}

export async function POST(req: Request) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!CAN_CREATE.includes(session.user.role)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์สร้างคดี' }, { status: 403 })
  }

  const body = await req.json()
  const {
    caseTitle, caseType, priority, description, debtAmount,
    department, assignedEmployeeId, dueDate,
    client, debtor, templateId,
  } = body

  if (!caseTitle?.trim()) return NextResponse.json({ error: 'กรุณาระบุชื่อคดี' }, { status: 400 })
  if (!caseType)          return NextResponse.json({ error: 'กรุณาระบุประเภทคดี' }, { status: 400 })

  // Auto-generate case number KM-YYYY-XXXX inside a transaction
  const year = new Date().getFullYear()
  const seqRow = await prisma.$transaction(async (tx) => {
    return tx.caseNumberSeq.upsert({
      where:  { year },
      create: { year, last: 1 },
      update: { last: { increment: 1 } },
    })
  })
  const caseNumber = `KM-${year}-${String(seqRow.last).padStart(4, '0')}`

  const newCase = await prisma.case.create({
    data: {
      caseNumber,
      caseTitle:          caseTitle.trim(),
      caseType,
      priority:           priority    ?? 'MEDIUM',
      description:        description?.trim() ?? null,
      debtAmount:         debtAmount  ? Number(debtAmount) : null,
      department:         department  ?? null,
      assignedEmployeeId: assignedEmployeeId ?? null,
      createdById:        session.user.id,
      dueDate:            dueDate ? new Date(dueDate) : null,
      templateId:         templateId ?? null,
      client: client?.clientName || client?.companyName
        ? { create: {
            clientName:    client.clientName?.trim()    ?? null,
            companyName:   client.companyName?.trim()   ?? null,
            taxId:         client.taxId?.trim()         ?? null,
            phone:         client.phone?.trim()         ?? null,
            email:         client.email?.trim()         ?? null,
            address:       client.address?.trim()       ?? null,
            contactPerson: client.contactPerson?.trim() ?? null,
            note:          client.note?.trim()          ?? null,
          } }
        : undefined,
      debtor: debtor?.fullName?.trim()
        ? { create: {
            fullName:  debtor.fullName.trim(),
            idCard:    debtor.idCard?.trim()    ?? null,
            phone:     debtor.phone?.trim()     ?? null,
            email:     debtor.email?.trim()     ?? null,
            address:   debtor.address?.trim()   ?? null,
            workplace: debtor.workplace?.trim() ?? null,
            riskLevel: debtor.riskLevel         ?? 'MEDIUM',
            assetInfo: debtor.assetInfo?.trim() ?? null,
            note:      debtor.note?.trim()      ?? null,
          } }
        : undefined,
    },
    include: {
      assignedEmployee: { select: userSelect },
      createdBy:        { select: userSelect },
      client:           true,
      debtor:           true,
    },
  })

  // Timeline — case created
  await prisma.caseTimeline.create({
    data: {
      caseId:      newCase.id,
      userId:      session.user.id,
      action:      'created',
      description: `${session.user.name} สร้างคดี ${caseNumber}`,
      meta:        JSON.stringify({ caseType, priority: priority ?? 'MEDIUM' }),
    },
  })

  // Auto task generation from template or caseType defaults
  const taskAssigneeId = assignedEmployeeId ?? session.user.id
  const autoTaskDefs: Array<{ title: string; priority?: string; dayOffset?: number }> = []

  if (templateId) {
    const tmpl = await prisma.caseTemplate.findUnique({ where: { id: templateId } })
    if (tmpl) {
      const parsed = JSON.parse(tmpl.taskJson) as Array<{ title: string; priority?: string; dayOffset?: number }>
      autoTaskDefs.push(...parsed)
      // Set SLA deadline
      if (tmpl.slaHours) {
        await prisma.case.update({
          where: { id: newCase.id },
          data:  { slaDeadline: new Date(Date.now() + tmpl.slaHours * 60 * 60 * 1000) },
        })
      }
      // Auto-create checklist from template
      const checklistItems = JSON.parse(tmpl.checklistJson) as Array<{ label: string; required?: boolean }>
      if (checklistItems.length > 0) {
        await prisma.caseChecklist.createMany({
          data: checklistItems.map((item, idx) => ({
            caseId:    newCase.id,
            label:     item.label,
            required:  item.required ?? false,
            sortOrder: idx,
          })),
        })
      }
    }
  } else {
    // Default tasks by caseType
    const DEFAULT_TASKS: Record<string, Array<{ title: string; priority: string; dayOffset: number }>> = {
      DEBT_COLLECTION: [
        { title: 'ตรวจสอบเอกสารคดี', priority: 'HIGH', dayOffset: 1 },
        { title: 'โทรติดต่อลูกหนี้', priority: 'HIGH', dayOffset: 2 },
        { title: 'นัดชำระหนี้', priority: 'MEDIUM', dayOffset: 7 },
        { title: 'สรุปรายงานคดี', priority: 'MEDIUM', dayOffset: 30 },
      ],
      LEGAL: [
        { title: 'ตรวจสอบเอกสารคดี', priority: 'HIGH', dayOffset: 1 },
        { title: 'เตรียมคำฟ้อง', priority: 'HIGH', dayOffset: 7 },
        { title: 'ยื่นศาล', priority: 'CRITICAL', dayOffset: 14 },
        { title: 'นัดพิจารณาคดี', priority: 'HIGH', dayOffset: 21 },
      ],
      COURT: [
        { title: 'เตรียมเอกสารศาล', priority: 'HIGH', dayOffset: 1 },
        { title: 'นัดประชุมทนาย', priority: 'MEDIUM', dayOffset: 3 },
      ],
    }
    if (DEFAULT_TASKS[caseType]) autoTaskDefs.push(...DEFAULT_TASKS[caseType])
  }

  if (autoTaskDefs.length > 0) {
    const caseDate = new Date()
    await prisma.taskAssignment.createMany({
      data: autoTaskDefs.map(t => ({
        title:        t.title,
        type:         'CASE_TASK' as never,
        status:       'PENDING',
        priority:     (t.priority ?? 'MEDIUM') as never,
        assigneeId:   taskAssigneeId,
        assignedById: session.user.id,
        caseId:       newCase.id,
        caseNumber:   caseNumber,
        dueDate:      new Date(caseDate.getTime() + (t.dayOffset ?? 7) * 86400000),
      })),
    }).catch(() => {})

    await prisma.caseTimeline.create({
      data: {
        caseId:      newCase.id,
        userId:      session.user.id,
        action:      'auto_tasks_created',
        description: `ระบบสร้างงานอัตโนมัติ ${autoTaskDefs.length} งาน`,
        meta:        JSON.stringify({ count: autoTaskDefs.length, source: templateId ? 'template' : 'default' }),
      },
    })
  }

  // Notify assigned employee
  if (assignedEmployeeId && assignedEmployeeId !== session.user.id) {
    await createNotification({
      userId:  assignedEmployeeId,
      type:    'CASE_ASSIGNED',
      title:   '📁 ได้รับมอบหมายคดีใหม่',
      message: `${session.user.name} มอบหมายคดี ${caseNumber}: ${caseTitle.trim()}`,
      link:    `/cases/${newCase.id}`,
    })
    const emp = await prisma.user.findUnique({ where: { id: assignedEmployeeId }, select: { lineUserId: true } })
    if (emp?.lineUserId) {
      await sendLineMessage(assignedEmployeeId, `📁 คดีใหม่\n${caseNumber}: ${caseTitle.trim()}\nมอบหมายโดย: ${session.user.name}`)
    }
  }

  triggerAutomation('CASE_CREATED', {
    caseId:             newCase.id,
    caseNumber:         newCase.caseNumber,
    caseType:           newCase.caseType,
    clientId:           client ?? null,
    assignedToId:       assignedEmployeeId ?? null,
    createdById:        session.user.id,
  }, session.user.id).catch(() => undefined)

  return NextResponse.json({ case: newCase }, { status: 201 })
} catch (err) {
  return apiError(err)
 }
}
