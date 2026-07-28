import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { createAuditLog } from '@/lib/notifications'
import { DEBTOR_DELETE_ROLES } from '@/lib/debtor-access'

type Params = { params: Promise<{ id: string }> }

/** กู้คืนลูกหนี้ที่ถูก soft-delete ไปแล้ว — เปิดให้ role เดียวกับที่ DELETE ใช้
 * (DEBTOR_DELETE_ROLES: company-wide roles เท่านั้น ไม่มี scope แยกตาม assignedTo) */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!DEBTOR_DELETE_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const existing = await prisma.debtor.findUnique({ where: { id }, select: { deletedAt: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!existing.deletedAt) return NextResponse.json({ error: 'รายการนี้ไม่ได้ถูกลบ' }, { status: 400 })

    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'

    await prisma.debtor.update({
      where: { id },
      data: { deletedAt: null, deletedById: null },
      select: { id: true },
    })

    await createAuditLog({
      actorId: session.user.id, targetId: id, targetType: 'Debtor',
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
