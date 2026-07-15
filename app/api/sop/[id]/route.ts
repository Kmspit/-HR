import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'

const EDITOR_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']
const APPROVER_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const sop = await prisma.sopDocument.findUnique({
    where: { id },
    include: {
      createdBy:  { select: { name: true, role: true } },
      approvedBy: { select: { name: true } },
      versions: {
        orderBy: { version: 'desc' },
        include: { changedBy: { select: { name: true } } },
      },
    },
  })
  if (!sop) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(sop)
} catch (err) {
  return apiError(err)
 }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!EDITOR_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()
  const existing = await prisma.sopDocument.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { title, description, steps, checklist, relatedDocs, note, status, changeNote } = body

  const data: Record<string, unknown> = {}
  if (title)       data.title       = title
  if (description !== undefined) data.description = description
  if (steps)       data.steps       = JSON.stringify(steps)
  if (checklist)   data.checklist   = JSON.stringify(checklist)
  if (relatedDocs) data.relatedDocs = JSON.stringify(relatedDocs)
  if (note !== undefined) data.note = note

  // Status transitions
  if (status) {
    if (status === 'APPROVED' && !APPROVER_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: 'Only CEO/MANAGER_HR can approve SOPs' }, { status: 403 })
    }
    data.status = status
    if (status === 'APPROVED') {
      data.approvedById = session.user.id
      data.approvedAt   = new Date()
    }
  }

  // Bump version if content changed
  const contentChanged = steps || checklist || title || description !== undefined
  if (contentChanged) {
    data.version = existing.version + 1
  }

  const updated = await prisma.sopDocument.update({ where: { id }, data })

  // Create version snapshot
  if (contentChanged) {
    await prisma.sopVersion.create({
      data: {
        sopId:       id,
        version:     updated.version,
        changeNote:  changeNote ?? 'แก้ไขเนื้อหา',
        snapshot:    JSON.stringify(updated),
        changedById: session.user.id,
      },
    })
  }

  return NextResponse.json(updated)
} catch (err) {
  return apiError(err)
 }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'CEO', 'MANAGER_HR'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  await prisma.sopDocument.delete({ where: { id } })
  return NextResponse.json({ success: true })
} catch (err) {
  return apiError(err)
 }
}
