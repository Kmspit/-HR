import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { createAuditLog } from '@/lib/notifications'
import { hasPermission } from '@/lib/access-control'
import { canViewUserRecord, isCompanyWideApprover } from '@/lib/org-scope'
import type { Role } from '@prisma/client'

type Params = { params: Promise<{ id: string }> }

/** กู้คืนคำขอ "ออกนอกสถานที่" ที่ถูก soft-delete ไปแล้ว — เปิดให้ role เดียวกับที่
 * DELETE/PATCH ใช้ (approve_outside_work), scope แบบเดียวกัน: company-wide roles
 * เห็นทุกอัน, MANAGER/TEAM_LEADER จำกัดแค่ direct reports ของตัวเอง */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const role = session.user.role as Role
    if (!hasPermission(role, 'approve_outside_work')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const existing = await prisma.outsideWorkRequest.findUnique({
      where: { id },
      select: { deletedAt: true, userId: true },
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!existing.deletedAt) {
      return NextResponse.json({ error: 'รายการนี้ไม่ได้ถูกลบ' }, { status: 400 })
    }

    const inScope =
      isCompanyWideApprover(role) ||
      await canViewUserRecord(prisma, session.user.id, role, session.user.branchId, existing.userId)
    if (!inScope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'

    await prisma.outsideWorkRequest.update({
      where: { id },
      data: { deletedAt: null, deletedById: null },
      select: { id: true },
    })

    await createAuditLog({
      actorId: session.user.id, targetId: id, targetType: 'OutsideWorkRequest',
      action: 'UPDATE',
      before: { deletedAt: existing.deletedAt },
      after:  { deletedAt: null },
      ip,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
