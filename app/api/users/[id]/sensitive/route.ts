import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { requireAuth, isGuardResponse } from '@/lib/api-guard'
import { SAFE_USER_SELECT_WITH_NATIONAL_ID } from '@/lib/safe-user-select'
import { HR_ADMIN } from '@/lib/module-gates'
import { createAuditLog } from '@/lib/notifications'
import type { Role } from '@prisma/client'

/**
 * Returns fields SAFE_USER_SELECT deliberately omits (currently just nationalId).
 * HR_ADMIN only — MANAGER can view/edit a report's profile via /api/users/[id] but
 * must not see the national ID. Every call is audit-logged, success or denied, so
 * access to this data is traceable even though it never appears in default responses.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth()
    if (isGuardResponse(session)) return session

    const { id } = await params
    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'

    if (!HR_ADMIN.includes(session.user.role as Role)) {
      await createAuditLog({
        actorId: session.user.id,
        targetId: id,
        targetType: 'UserSensitiveData',
        action: 'VIEW',
        after: { result: 'FORBIDDEN', actorRole: session.user.role },
        ip,
      })
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: SAFE_USER_SELECT_WITH_NATIONAL_ID,
    })
    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await createAuditLog({
      actorId: session.user.id,
      targetId: id,
      targetType: 'UserSensitiveData',
      action: 'VIEW',
      after: { result: 'SUCCESS' },
      ip,
    })

    return NextResponse.json({ user })
  } catch (err) {
    return apiError(err)
  }
}
