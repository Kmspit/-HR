import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { canApproveWarning, canManageUsers } from '@/lib/access-control'
import { createAuditLog, createNotification } from '@/lib/notifications'
import {
  canViewUserRecord,
  isCompanyWideApprover,
} from '@/lib/org-scope'
import { requireCsrf } from '@/lib/api-guard'
import type { Role } from '@prisma/client'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const role = session.user.role as Role

    const warning = await prisma.warning.findUnique({
      where: { id },
      include: {
        user:       { select: { id: true, name: true, employeeId: true, department: true, position: true } },
        issuedBy:   { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        rejectedBy: { select: { id: true, name: true } },
      },
    })

    if (!warning) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const canSee =
      warning.userId === session.user.id ||
      canManageUsers(role) ||
      (canApproveWarning(role) &&
        (isCompanyWideApprover(role) ||
          await canViewUserRecord(
            prisma,
            session.user.id,
            role,
            session.user.branchId,
            warning.userId,
          )))

    if (!canSee) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Employee can only see APPROVED warnings
    if (
      warning.userId === session.user.id &&
      !canApproveWarning(role) &&
      !canManageUsers(role) &&
      warning.status !== 'APPROVED'
    ) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ warning })
  } catch (err) {
    return apiError(err)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const csrfErr = requireCsrf(req)
    if (csrfErr) return csrfErr

    const role = session.user.role as Role
    if (!canApproveWarning(role) && !canManageUsers(role)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const { id } = await params
    const body = (await req.json()) as {
      action: 'APPROVE' | 'REJECT' | 'ARCHIVE'
      note?: string
      rejectedReason?: string
    }

    if (!['APPROVE', 'REJECT', 'ARCHIVE'].includes(body.action)) {
      return NextResponse.json({ error: 'action ต้องเป็น APPROVE | REJECT | ARCHIVE' }, { status: 400 })
    }

    const warning = await prisma.warning.findUnique({ where: { id } })
    if (!warning) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const inScope =
      isCompanyWideApprover(role) ||
      canManageUsers(role) ||
      await canViewUserRecord(
        prisma,
        session.user.id,
        role,
        session.user.branchId,
        warning.userId,
      )
    if (!inScope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const now = new Date()
    const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
    let updateData: Record<string, unknown> = {}

    if (body.action === 'APPROVE') {
      if (warning.status !== 'PENDING_APPROVAL') {
        return NextResponse.json({ error: 'สถานะไม่ถูกต้องสำหรับการอนุมัติ' }, { status: 400 })
      }
      const expiredAt = new Date(now)
      expiredAt.setMonth(expiredAt.getMonth() + 12)
      updateData = {
        status: 'APPROVED',
        approvedById: session.user.id,
        approvedAt: now,
        approvalNote: body.note ?? null,
        expiredAt,
      }

      // Notify the employee
      await createNotification({
        userId: warning.userId,
        type: 'WARNING_ISSUED',
        title: `ได้รับใบเตือน (ระดับ ${warning.level})`,
        message: warning.reason,
        link: `/warnings/${warning.id}`,
      })
    } else if (body.action === 'REJECT') {
      if (warning.status !== 'PENDING_APPROVAL') {
        return NextResponse.json({ error: 'สถานะไม่ถูกต้องสำหรับการปฏิเสธ' }, { status: 400 })
      }
      updateData = {
        status: 'REJECTED',
        rejectedById: session.user.id,
        rejectedAt: now,
        rejectedReason: body.rejectedReason ?? null,
        approvalNote: body.note ?? null,
      }
    } else if (body.action === 'ARCHIVE') {
      if (!['APPROVED', 'REJECTED'].includes(warning.status)) {
        return NextResponse.json({ error: 'สามารถ archive ได้เฉพาะใบเตือนที่ APPROVED หรือ REJECTED' }, { status: 400 })
      }
      updateData = { status: 'ARCHIVED', archivedAt: now }
    }

    const updated = await prisma.warning.update({
      where: { id },
      data: updateData,
      include: {
        user:       { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        rejectedBy: { select: { id: true, name: true } },
      },
    })

    await createAuditLog({
      actorId:    session.user.id,
      targetId:   warning.userId,
      targetType: 'Warning',
      action:     body.action === 'APPROVE' ? 'APPROVE' : body.action === 'REJECT' ? 'REJECT' : 'UPDATE',
      before:     { status: warning.status },
      after:      { status: updated.status, warningId: id },
      ip,
    })

    return NextResponse.json({ success: true, warning: updated })
  } catch (err) {
    return apiError(err)
  }
}
