import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { createAuditLog } from '@/lib/notifications'
import { hasPermission } from '@/lib/rbac'
import type { Role } from '@prisma/client'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const request = await prisma.outsideWorkRequest.findUnique({
      where: { id },
      include: {
        user: { select: { name: true, department: true, position: true } },
        approvals: {
          include: { approvedBy: { select: { id: true, name: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const canView =
      request.userId === session.user.id ||
      hasPermission(session.user.role as Role, 'approve_outside_work')

    if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    return NextResponse.json({ request })
  } catch (err) {
    return apiError(err)
  }
}

/** HR/Admin แก้ไขสถานที่ + หมายเหตุ พร้อม audit log */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!hasPermission(session.user.role as Role, 'approve_outside_work')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const { id } = await params
    const existing = await prisma.outsideWorkRequest.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = (await req.json()) as { place?: string; note?: string; startTime?: string; endTime?: string }

    if (body.place !== undefined && !body.place.trim()) {
      return NextResponse.json({ error: 'กรุณาระบุสถานที่' }, { status: 400 })
    }

    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'

    const updateData: Record<string, string | null> = {}
    if (body.place !== undefined)     updateData.place     = body.place.trim()
    if (body.note !== undefined)      updateData.note      = body.note?.trim() || null
    if (body.startTime !== undefined) updateData.startTime = body.startTime
    if (body.endTime !== undefined)   updateData.endTime   = body.endTime

    const updated = await prisma.outsideWorkRequest.update({
      where: { id },
      data: updateData,
    })

    await createAuditLog({
      actorId:    session.user.id,
      targetId:   id,
      targetType: 'OutsideWorkRequest',
      action:     'UPDATE',
      before:     { place: existing.place, note: existing.note, startTime: existing.startTime, endTime: existing.endTime },
      after:      { place: updated.place,  note: updated.note,  startTime: updated.startTime,  endTime: updated.endTime },
      ip,
    })

    return NextResponse.json({ success: true, request: updated })
  } catch (err) {
    return apiError(err)
  }
}
