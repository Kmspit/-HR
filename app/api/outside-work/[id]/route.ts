import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { createAuditLog } from '@/lib/notifications'
import { hasPermission } from '@/lib/access-control'
import {
  canViewUserRecord,
  isCompanyWideApprover,
} from '@/lib/org-scope'
import type { Role, Prisma } from '@prisma/client'
import { parseNonNegativeNumber } from '@/lib/utils'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const request = await prisma.outsideWorkRequest.findUnique({
      where: { id, deletedAt: null },
      select: {
        id: true, userId: true, date: true, startTime: true, endTime: true,
        place: true, purpose: true, client: true, note: true, status: true,
        chainConfigId: true, currentStepOrder: true, createdAt: true,
        googleMapsUrl: true, attachmentUrl: true, attachmentName: true, approvalStatus: true,
        employeeName: true, ownerName: true, workType: true, distance: true, distanceLimit: true, routeType: true,
        timeSlot: true, caseNumber: true, productWork: true, productCategory: true, productType: true,
        workBranch: true, caseCount: true, adminChecked: true, supervisedBy: true, documentNumber: true,
        clientCompanyId: true,
        clientCompany: { select: { companyName: true } },
        user: { select: { name: true, department: true, position: true } },
        assignees: { select: { user: { select: { id: true, name: true } } } },
        approvals: {
          select: {
            id: true, action: true, reason: true, createdAt: true,
            approvedBy: { select: { id: true, name: true, role: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const role = session.user.role as Role
    const canView =
      request.userId === session.user.id ||
      (hasPermission(role, 'approve_outside_work') &&
        (isCompanyWideApprover(role) ||
          await canViewUserRecord(
            prisma,
            session.user.id,
            role,
            session.user.branchId,
            request.userId,
          )))

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
    const existing = await prisma.outsideWorkRequest.findUnique({
      where: { id, deletedAt: null },
      select: { userId: true, status: true, approvalStatus: true, place: true, note: true },
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const role = session.user.role as Role
    const isHR    = hasPermission(role, 'approve_outside_work')
    const isOwner = existing.userId === session.user.id
    const isPending = existing.status === 'PENDING'
      || existing.approvalStatus === 'pending_ceo'
      || existing.approvalStatus === 'pending_chain'

    if (isHR) {
      const inScope =
        isCompanyWideApprover(role) ||
        await canViewUserRecord(
          prisma,
          session.user.id,
          role,
          session.user.branchId,
          existing.userId,
        )
      if (!inScope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    } else if (!(isOwner && isPending)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const body = await req.json() as {
      place?: string; note?: string; startTime?: string; endTime?: string
      purpose?: string; client?: string; date?: string; googleMapsUrl?: string
      employeeName?: string; ownerName?: string; workType?: string
      distance?: number | string; distanceLimit?: number | string; routeType?: string
      approvalStatus?: string; status?: string
      timeSlot?: string; caseNumber?: string; productWork?: string; productCategory?: string; productType?: string; workBranch?: string
      caseCount?: number | string; adminChecked?: string; supervisedBy?: string
      clientCompanyId?: string
      assigneeIds?: string[]
    }

    if (body.place !== undefined && !body.place?.trim()) {
      return NextResponse.json({ error: 'กรุณาระบุสถานที่' }, { status: 400 })
    }
    // caseCount/distance/distanceLimit: 0 is valid ("none yet"), negative is not.
    if (body.caseCount && parseNonNegativeNumber(body.caseCount) == null) {
      return NextResponse.json({ error: 'จำนวนคดีต้องไม่ติดลบ' }, { status: 400 })
    }
    if (body.distance && parseNonNegativeNumber(body.distance) == null) {
      return NextResponse.json({ error: 'ระยะทางต้องไม่ติดลบ' }, { status: 400 })
    }
    if (body.distanceLimit && parseNonNegativeNumber(body.distanceLimit) == null) {
      return NextResponse.json({ error: 'ระยะทางจำกัดต้องไม่ติดลบ' }, { status: 400 })
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
    if (body.productCategory !== undefined) updateData.productCategory = body.productCategory?.trim() || null
    if (body.productType     !== undefined) updateData.productType     = body.productType?.trim() || null
    if (body.workBranch   !== undefined) updateData.workBranch   = body.workBranch?.trim() || null
    if (body.caseCount    !== undefined) updateData.caseCount    = body.caseCount ? Number(body.caseCount) : null
    if (body.adminChecked !== undefined) updateData.adminChecked = body.adminChecked?.trim() || null
    if (body.supervisedBy !== undefined) updateData.supervisedBy = body.supervisedBy?.trim() || null
    if (body.clientCompanyId !== undefined) updateData.clientCompanyId = body.clientCompanyId || null

    if (isHR) {
      // Status changes only via approval chain — not direct PATCH
    }

    const selectShape = {
      id: true, userId: true, date: true, startTime: true, endTime: true,
      place: true, purpose: true, client: true, note: true, status: true,
      chainConfigId: true, currentStepOrder: true, createdAt: true,
      googleMapsUrl: true, attachmentUrl: true, attachmentName: true, approvalStatus: true,
      employeeName: true, ownerName: true, workType: true, distance: true, distanceLimit: true, routeType: true,
      timeSlot: true, caseNumber: true, productWork: true, productCategory: true, productType: true,
      workBranch: true, caseCount: true, adminChecked: true, supervisedBy: true, documentNumber: true,
      clientCompanyId: true,
      clientCompany: { select: { companyName: true } },
      assignees: { select: { user: { select: { id: true, name: true } } } },
    } as const

    let updated: Prisma.OutsideWorkRequestGetPayload<{ select: typeof selectShape }>
    if (body.assigneeIds !== undefined) {
      const assigneeIds = body.assigneeIds
      const ops: Prisma.PrismaPromise<unknown>[] = [
        prisma.outsideWorkRequest.update({ where: { id }, data: updateData, select: { id: true } }),
        prisma.outsideWorkAssignee.deleteMany({ where: { outsideWorkRequestId: id } }),
      ]
      if (assigneeIds.length > 0) {
        ops.push(prisma.outsideWorkAssignee.createMany({
          data: [...new Set(assigneeIds)].map((userId) => ({ outsideWorkRequestId: id, userId })),
        }))
      }
      await prisma.$transaction(ops)
      updated = await prisma.outsideWorkRequest.findUniqueOrThrow({ where: { id }, select: selectShape })
    } else {
      updated = await prisma.outsideWorkRequest.update({ where: { id }, data: updateData, select: selectShape })
    }

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

/** เจ้าของลบคำขอที่ยัง PENDING ได้ / HR-Admin ลบได้ทุก field ที่อยู่ในขอบเขต */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const existing = await prisma.outsideWorkRequest.findUnique({
      where: { id },
      select: { userId: true, status: true, approvalStatus: true, deletedAt: true },
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (existing.deletedAt) {
      return NextResponse.json({ error: 'รายการนี้ถูกลบไปแล้ว' }, { status: 400 })
    }

    const role = session.user.role as Role
    const isHR    = hasPermission(role, 'approve_outside_work')
    const isOwner = existing.userId === session.user.id
    const isPending = existing.status === 'PENDING'
      || existing.approvalStatus === 'pending_ceo'
      || existing.approvalStatus === 'pending_chain'

    if (!isPending) {
      return NextResponse.json({ error: 'ลบได้เฉพาะรายการที่ยังรออนุมัติเท่านั้น' }, { status: 400 })
    }

    if (isHR) {
      const inScope =
        isCompanyWideApprover(role) ||
        await canViewUserRecord(
          prisma,
          session.user.id,
          role,
          session.user.branchId,
          existing.userId,
        )
      if (!inScope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    } else if (!isOwner) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    // Soft-delete only — งานคดีความอาจต้องตรวจสอบย้อนหลัง ห้าม hard delete
    await prisma.outsideWorkRequest.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: session.user.id },
      select: { id: true },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
