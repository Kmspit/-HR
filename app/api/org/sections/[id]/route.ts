import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { canManageOrg } from '@/lib/org-permissions'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user || !canManageOrg(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { id } = await params
    const body = await req.json()
    const section = await prisma.section.update({
      where: { id },
      data: {
        ...(body.code != null && { code: String(body.code).trim().toUpperCase() }),
        ...(body.name != null && { name: String(body.name).trim() }),
        ...(body.nameEn !== undefined && { nameEn: body.nameEn?.trim() || null }),
        ...(body.isActive !== undefined && { isActive: Boolean(body.isActive) }),
        ...(body.sortOrder !== undefined && { sortOrder: Number(body.sortOrder) }),
      },
    })
    return NextResponse.json({ section })
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user || !canManageOrg(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { id } = await params
    const users = await prisma.user.count({ where: { sectionId: id } })
    if (users > 0) {
      return NextResponse.json({ error: 'ไม่สามารถลบได้ — มีพนักงานผูกอยู่' }, { status: 400 })
    }
    await prisma.section.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
