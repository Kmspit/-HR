import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { apiError } from '@/lib/api-handler'

const CAN_MANAGE = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!CAN_MANAGE.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const client = await prisma.user.findUnique({
    where: { id, role: 'CLIENT' },
    select: {
      id: true, name: true, email: true, phone: true, status: true,
      createdAt: true, department: true,
      clientTasks: {
        select: { id: true, title: true, caseNumber: true, clientName: true, status: true, taskDepartment: true, dueDate: true, courtDate: true },
        orderBy: { createdAt: 'desc' },
      },
      clientDocs: {
        select: { id: true, title: true, docType: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(client)
} catch (err) {
  return apiError(err)
 }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!CAN_MANAGE.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const client = await prisma.user.findUnique({ where: { id, role: 'CLIENT' } })
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { name, email, phone, status, companyName, password, linkTaskId, unlinkTaskId, linkDocId, unlinkDocId } = body

  // Link/unlink tasks
  if (linkTaskId) {
    await prisma.taskAssignment.update({ where: { id: linkTaskId }, data: { clientId: id } })
    return NextResponse.json({ ok: true, action: 'task_linked' })
  }
  if (unlinkTaskId) {
    await prisma.taskAssignment.update({ where: { id: unlinkTaskId }, data: { clientId: null } })
    return NextResponse.json({ ok: true, action: 'task_unlinked' })
  }
  if (linkDocId) {
    await prisma.caseDocument.update({ where: { id: linkDocId }, data: { clientId: id } })
    return NextResponse.json({ ok: true, action: 'doc_linked' })
  }
  if (unlinkDocId) {
    await prisma.caseDocument.update({ where: { id: unlinkDocId }, data: { clientId: null } })
    return NextResponse.json({ ok: true, action: 'doc_unlinked' })
  }

  const updateData: Record<string, unknown> = {}
  if (name)        updateData.name       = name.trim()
  if (email)       updateData.email      = email.trim().toLowerCase()
  if (phone !== undefined) updateData.phone = phone?.trim() || null
  if (status)      updateData.status     = status
  if (companyName !== undefined) updateData.department = companyName?.trim() || null
  if (password)    updateData.passwordHash = await bcrypt.hash(password, 10)

  const updated = await prisma.user.update({
    where: { id },
    data:  updateData,
    select: { id: true, name: true, email: true, phone: true, status: true, department: true },
  })

  return NextResponse.json(updated)
} catch (err) {
  return apiError(err)
 }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const client = await prisma.user.findUnique({ where: { id, role: 'CLIENT' } })
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Unlink tasks and docs first
  await prisma.taskAssignment.updateMany({ where: { clientId: id }, data: { clientId: null } })
  await prisma.caseDocument.updateMany({ where: { clientId: id }, data: { clientId: null } })

  // page_permission_overrides has no real FK (same gap class as every
  // FK-shaped column scripts/purge-user.mjs documents — this project never
  // runs `prisma migrate` against the live Turso DB, so schema.prisma's
  // relation annotations aren't DB-enforced) — deleting a CLIENT user here
  // without this would orphan any row where they're either the override's
  // TARGET (userId) or — in practice never, since only SUPER_ADMIN/CEO/
  // MANAGER_HR can ever create one — its creator (createdById). Cleaned up
  // defensively for both, in the same transaction as the user delete itself
  // (2026-10-06 security review finding — this route is a second user-
  // deletion path besides scripts/purge-user.mjs, which already handles
  // this table). Other tables' cleanup is intentionally out of scope here.
  await prisma.$transaction([
    prisma.pagePermissionOverride.deleteMany({ where: { OR: [{ userId: id }, { createdById: id }] } }),
    prisma.user.delete({ where: { id } }),
  ])

  return NextResponse.json({ ok: true })
} catch (err) {
  return apiError(err)
 }
}
