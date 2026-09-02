import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { requireAuth, isGuardResponse } from '@/lib/api-guard'
import { decryptField, FIELD_SALTS } from '@/lib/field-crypto'
import { HR_ADMIN } from '@/lib/module-gates'
import { createAuditLog } from '@/lib/notifications'
import type { Role } from '@prisma/client'

/**
 * Reveals a dependent's full national ID — same shape as
 * app/api/users/[id]/sensitive/route.ts (the employee's own national ID):
 * HR_ADMIN only, every call audit-logged (success or denied) so access is
 * traceable even though the value never appears in the default list
 * response. targetId is the EMPLOYEE's id (not the dependent's), matching
 * how the rest of the employee-history feed groups by employee; the
 * specific dependentId is carried in the log's `after` payload instead.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; dependentId: string }> },
) {
  try {
    const session = await requireAuth()
    if (isGuardResponse(session)) return session

    const { id, dependentId } = await params
    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'

    if (!HR_ADMIN.includes(session.user.role as Role)) {
      await createAuditLog({
        actorId: session.user.id,
        targetId: id,
        targetType: 'DependentSensitiveData',
        action: 'VIEW',
        after: { result: 'FORBIDDEN', actorRole: session.user.role, dependentId },
        ip,
      })
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const dependent = await prisma.dependent.findFirst({
      where: { id: dependentId, userId: id },
      select: { nationalIdEnc: true },
    })
    if (!dependent) return NextResponse.json({ error: 'ไม่พบข้อมูล' }, { status: 404 })

    const nationalId = dependent.nationalIdEnc
      ? decryptField(dependent.nationalIdEnc, FIELD_SALTS.DEPENDENT_NATIONAL_ID)
      : null

    await createAuditLog({
      actorId: session.user.id,
      targetId: id,
      targetType: 'DependentSensitiveData',
      action: 'VIEW',
      after: { result: 'SUCCESS', dependentId },
      ip,
    })

    return NextResponse.json({ nationalId })
  } catch (err) {
    return apiError(err)
  }
}
