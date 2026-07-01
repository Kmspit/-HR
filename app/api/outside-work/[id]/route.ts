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

/** เจ้าของแก้คำขอที่ยัง PENDING ได้ / HR-Admin แก้ได้ทุก field */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const existing = await prisma.outsideWorkRequest.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isHR    = hasPermission(session.user.role as Role, 'approve_outside_work')
    const isOwner = existing.userId === session.user.id
    const isPending = existing.status === 'PENDING'
      || existing.approvalStatus === 'pending_ceo'
      || existing.approvalStatus === 'pending_chain'

    if (!isHR && !(isOwner && isPending)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const body = await req.json() as {
      place?: string; note?: string; startTime?: string; endTime?: string
      purpose?: string; client?: string; date?: string; googleMapsUrl?: string
      employeeName?: string; ownerName?: string; workType?: string
      distance?: number | string; distanceLimit?: number | string; routeType?: string
      approvalStatus?: string; status?: string
      timeSlot?: string; caseNumber?: string; productWork?: string; workBranch?: string
      caseCount?: number | string; adminChecked?: string; supervisedBy?: string
    }

    if (body.place !== undefined && !body.place?.trim()) {
      return NextResponse.json({ error: 'กรุณาระบุสถานที่' }, { status: 400 })
    }

    if (!isHR && (body.approvalStatus !== undefined || body.status !== undefined)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'

    const updateData: Record<string, unknown> = {}
    if (body.place        !== undefined) updateData.place        = body.place?.trim()
    if (body.note         !== undefined) updateData.note         = body.note?.trim() || null
    if (body.startTime    !== undefined) updateData.startTime    = body.startTime
    if (body.endTime      !== undefined) updateData.endTime      = body.endTime
    if (body.purpose      !== undefined) updateData.purpose      = body.purpose?.trim()
    if (body.client       !== undefined) updateData.client       = body.client?.trim() || null
    if (body.date         !== undefined) updateData.date         = new Date(body.date)
    if (body.googleMapsUrl!== undefined) updateData.googleMapsUrl= body.googleMapsUrl?.trim() || null
    if (body.employeeName !== undefined) updateData.employeeName = body.employeeName?.trim() || null
    if (body.ownerName    !== undefined) updateData.ownerName    = body.ownerName?.trim() || null
    if (body.workType     !== undefined) updateData.workType     = body.workType?.trim() || null
    if (body.distance     !== undefined) updateData.distance     = body.distance ? Number(body.distance) : null
    if (body.distanceLimit!== undefined) updateData.distanceLimit= body.distanceLimit ? Number(body.distanceLimit) : null
    if (body.routeType    !== undefined) updateData.routeType    = body.routeType?.trim() || null
    if (body.timeSlot     !== undefined) updateData.timeSlot     = body.timeSlot?.trim()  || null
    if (body.caseNumber   !== undefined) updateData.caseNumber   = body.caseNumber?.trim() || null
    if (body.productWork  !== undefined) updateData.productWork  = body.productWork?.trim() || null
    if (body.workBranch   !== undefined) updateData.workBranch   = body.workBranch?.trim() || null
    if (body.caseCount    !== undefined) updateData.caseCount    = body.caseCount ? Number(body.caseCount) : null
    if (body.adminChecked !== undefined) updateData.adminChecked = body.adminChecked?.trim() || null
    if (body.supervisedBy !== undefined) updateData.supervisedBy = body.supervisedBy?.trim() || null

    if (isHR) {
      // Status changes only via approval chain — not direct PATCH
    }

    const updated = await prisma.outsideWorkRequest.update({ where: { id }, data: updateData })

    await createAuditLog({
      actorId: session.user.id, targetId: id, targetType: 'OutsideWorkRequest',
      action: 'UPDATE',
      before: { place: existing.place, note: existing.note },
      after:  { place: updated.place,  note: updated.note },
      ip,
    })

    return NextResponse.json({ success: true, request: updated })
  } catch (err) {
    return apiError(err)
  }
}
