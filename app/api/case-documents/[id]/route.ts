import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'

function configureCloudinary() {
  const name = process.env.CLOUDINARY_CLOUD_NAME?.trim()
  const key  = process.env.CLOUDINARY_API_KEY?.trim()
  const sec  = process.env.CLOUDINARY_API_SECRET?.trim()
  if (name && key && sec) cloudinary.config({ cloud_name: name, api_key: key, api_secret: sec, secure: true })
}

const CAN_MANAGE = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'MANAGER', 'TEAM_LEADER', 'ADMIN']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const doc = await prisma.caseDocument.findUnique({
    where: { id },
    include: {
      uploadedBy: { select: { id: true, name: true, role: true, position: true } },
      assignedTo: { select: { id: true, name: true, role: true } },
      files:      { orderBy: { version: 'desc' } },
      signatures: { orderBy: { signedAt: 'asc' } },
      versions:   { orderBy: { versionNumber: 'desc' } },
    },
  })

  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const canView = CAN_MANAGE.includes(session.user.role) || doc.uploadedById === session.user.id
  if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return NextResponse.json(doc)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const doc = await prisma.caseDocument.findUnique({ where: { id } })
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const canEdit = CAN_MANAGE.includes(session.user.role) || doc.uploadedById === session.user.id
  if (!canEdit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const {
    title, description, docType, category, caseId, caseNumber,
    clientName, department, taskId, debtorId, assignedToId, tags, status,
    isArchived, changeNote,
  } = body

  const updated = await prisma.caseDocument.update({
    where: { id },
    data: {
      ...(title        !== undefined && { title:        title.trim() }),
      ...(description  !== undefined && { description:  description?.trim() ?? null }),
      ...(docType      !== undefined && { docType }),
      ...(category     !== undefined && { category }),
      ...(caseId       !== undefined && { caseId }),
      ...(caseNumber   !== undefined && { caseNumber:   caseNumber?.trim() ?? null }),
      ...(clientName   !== undefined && { clientName:   clientName?.trim() ?? null }),
      ...(department   !== undefined && { department }),
      ...(taskId       !== undefined && { taskId }),
      ...(debtorId     !== undefined && { debtorId }),
      ...(assignedToId !== undefined && { assignedToId }),
      ...(tags         !== undefined && { tags: tags?.trim() ?? null }),
      ...(status       !== undefined && { status }),
      ...(isArchived   !== undefined && { isArchived }),
    },
    include: {
      uploadedBy: { select: { id: true, name: true, role: true } },
      assignedTo: { select: { id: true, name: true, role: true } },
      files:      { orderBy: { version: 'desc' } },
      signatures: { orderBy: { signedAt: 'asc' } },
      versions:   { orderBy: { versionNumber: 'desc' } },
    },
  })

  // Version history entry
  const lastVersion = await prisma.caseDocumentVersion.findFirst({
    where: { documentId: id },
    orderBy: { versionNumber: 'desc' },
  })
  await prisma.caseDocumentVersion.create({
    data: {
      documentId:    id,
      versionNumber: (lastVersion?.versionNumber ?? 0) + 1,
      changeNote:    changeNote?.trim() ?? 'แก้ไขข้อมูลเอกสาร',
      changedById:   session.user.id,
      changedByName: session.user.name ?? '',
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const doc = await prisma.caseDocument.findUnique({
    where: { id },
    include: { files: true },
  })
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const canDelete = CAN_MANAGE.includes(session.user.role) || doc.uploadedById === session.user.id
  if (!canDelete) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Delete Cloudinary files
  configureCloudinary()
  for (const f of doc.files) {
    try {
      await cloudinary.uploader.destroy(f.publicId)
    } catch { /* best-effort */ }
  }

  await prisma.caseDocument.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
