import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

const CAN_SIGN = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'MANAGER', 'TEAM_LEADER']

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const q          = searchParams.get('q')?.trim()
  const department = searchParams.get('department')
  const docType    = searchParams.get('docType')
  const status     = searchParams.get('status') ?? 'ACTIVE'
  const page       = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit      = 20

  const where: Record<string, unknown> = {}
  if (status !== 'ALL') where.status = status
  if (department) where.department = department
  if (docType) where.docType = docType
  if (q) {
    where.OR = [
      { title:      { contains: q } },
      { caseNumber: { contains: q } },
      { clientName: { contains: q } },
      { tags:       { contains: q } },
    ]
  }

  const [docs, total] = await Promise.all([
    prisma.caseDocument.findMany({
      where,
      include: {
        uploadedBy: { select: { id: true, name: true, role: true } },
        assignedTo: { select: { id: true, name: true, role: true } },
        files:      { orderBy: { version: 'desc' }, take: 1 },
        signatures: { orderBy: { signedAt: 'asc' } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.caseDocument.count({ where }),
  ])

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
  const { title, description, docType, caseNumber, clientName, department, taskId, assignedToId, tags } = body

  if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 })

  const doc = await prisma.caseDocument.create({
    data: {
      title:        title.trim(),
      description:  description?.trim() ?? null,
      docType:      docType ?? 'OTHER',
      caseNumber:   caseNumber?.trim() ?? null,
      clientName:   clientName?.trim() ?? null,
      department:   department ?? null,
      taskId:       taskId ?? null,
      assignedToId: assignedToId ?? null,
      uploadedById: session.user.id,
      tags:         tags?.trim() ?? null,
    },
    include: {
      uploadedBy: { select: { id: true, name: true, role: true } },
      assignedTo: { select: { id: true, name: true, role: true } },
    },
  })

  // Version entry #1
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
