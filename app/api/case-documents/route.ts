import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

const CAN_SIGN = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'MANAGER', 'TEAM_LEADER']
const EXEC     = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

// Same case-access pattern used across app/api/case-documents/upload/route.ts and
// app/api/case-documents/[id]/files/route.ts — duplicated locally per existing
// convention in this module rather than introducing a new shared helper.
async function canAccessCase(caseId: string, userId: string, role: string, department?: string | null) {
  if (EXEC.includes(role)) return true
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    select: { createdById: true, assignedEmployeeId: true, department: true },
  })
  if (!c) return false
  if (role === 'MANAGER' && department && c.department === department) return true
  return c.createdById === userId || c.assignedEmployeeId === userId
}

async function canAccessTask(taskId: string, userId: string) {
  const t = await prisma.taskAssignment.findUnique({
    where: { id: taskId },
    select: { assigneeId: true, assignedById: true },
  })
  if (!t) return false
  return t.assigneeId === userId || t.assignedById === userId
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const q          = searchParams.get('q')?.trim() || searchParams.get('search')?.trim()
  const department = searchParams.get('department')
  const docType    = searchParams.get('docType')
  const category   = searchParams.get('category')
  const caseId     = searchParams.get('caseId')
  const taskId     = searchParams.get('taskId')
  const tab        = searchParams.get('tab') ?? 'all'           // all|mine|court|evidence|recent|archived
  const page       = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit      = 20

  // A caseId/taskId filter used to bypass the "own + assigned" scoping below
  // entirely for non-exec/non-manager roles, letting anyone list every
  // document on any case just by supplying its id. Verify real access to that
  // specific case/task instead of skipping scoping.
  const isUnscopedRole = EXEC.includes(session.user.role) || session.user.role === 'MANAGER'
  if (caseId && !isUnscopedRole) {
    const allowed = await canAccessCase(caseId, session.user.id, session.user.role, session.user.department)
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (taskId && !isUnscopedRole) {
    const allowed = await canAccessTask(taskId, session.user.id)
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const where: Record<string, unknown> = {}

  // Tab logic
  switch (tab) {
    case 'mine':
      where.uploadedById = session.user.id
      where.isArchived   = false
      break
    case 'court':
      where.category   = 'COURT_DOCUMENT'
      where.isArchived = false
      break
    case 'evidence':
      where.category   = 'EVIDENCE'
      where.isArchived = false
      break
    case 'recent':
      where.isArchived = false
      where.createdAt  = { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      break
    case 'archived':
      where.isArchived = true
      break
    default: // all
      where.isArchived = false
  }

  // Extra filters (override tab defaults for specific fields)
  if (category) where.category = category
  if (docType)  where.docType  = docType
  if (caseId)   where.caseId   = caseId
  if (taskId)   where.taskId   = taskId
  if (department && EXEC.includes(session.user.role)) where.department = department

  // Permission scoping
  if (!EXEC.includes(session.user.role) && session.user.role !== 'MANAGER') {
    if (!caseId && !taskId && tab !== 'mine') {
      // For non-execs without a specific filter: show own + assigned
      where.OR = [
        { uploadedById: session.user.id },
        { assignedToId: session.user.id },
      ]
    }
  }

  if (q) {
    const qFilter = [
      { title:      { contains: q } },
      { caseNumber: { contains: q } },
      { clientName: { contains: q } },
      { tags:       { contains: q } },
      { description:{ contains: q } },
    ]
    if (where.OR) {
      where.AND = [{ OR: where.OR as unknown[] }, { OR: qFilter }]
      delete where.OR
    } else {
      where.OR = qFilter
    }
  }

  let docs, total
  try {
    ;[docs, total] = await Promise.all([
      prisma.caseDocument.findMany({
        where,
        include: {
          uploadedBy: { select: { id: true, name: true, role: true } },
          assignedTo: { select: { id: true, name: true, role: true } },
          files:      { orderBy: { version: 'desc' }, take: 1 },
          signatures: { orderBy: { signedAt: 'asc' }, select: { id: true, signerName: true, signedAt: true } },
          _count:     { select: { files: true, versions: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.caseDocument.count({ where }),
    ])
  } catch (err: any) {
    console.error('[case-documents GET] Error message:', err?.message)
    console.error('[case-documents GET] Error code:', err?.code)
    console.error('[case-documents GET] Full error:', JSON.stringify(err, Object.getOwnPropertyNames(err)))
    return NextResponse.json({ docs: [], total: 0 }, { status: 500 })
  }

  return NextResponse.json({
    docs,
    total,
    page,
    pages: Math.ceil(total / limit),
    canSign: CAN_SIGN.includes(session.user.role),
  })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    title, description, docType, category, caseId, caseNumber,
    clientName, department, taskId, debtorId, assignedToId, tags,
  } = body

  if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 })

  const doc = await prisma.caseDocument.create({
    data: {
      title:        title.trim(),
      description:  description?.trim() ?? null,
      docType:      docType    ?? 'OTHER',
      category:     category   ?? 'OTHER',
      caseId:       caseId     ?? null,
      caseNumber:   caseNumber?.trim() ?? null,
      clientName:   clientName?.trim() ?? null,
      department:   department ?? null,
      taskId:       taskId     ?? null,
      debtorId:     debtorId   ?? null,
      assignedToId: assignedToId ?? null,
      uploadedById: session.user.id,
      tags:         tags?.trim() ?? null,
    },
    include: {
      uploadedBy: { select: { id: true, name: true, role: true } },
      assignedTo: { select: { id: true, name: true, role: true } },
    },
  })

  await prisma.caseDocumentVersion.create({
    data: {
      documentId:    doc.id,
      versionNumber: 1,
      changeNote:    'สร้างเอกสาร',
      changedById:   session.user.id,
      changedByName: session.user.name ?? '',
    },
  })

  return NextResponse.json(doc, { status: 201 })
}
