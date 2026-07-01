import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { Session } from 'next-auth'
import { auth } from '@/lib/auth'
import { hasPermission, type AppPermission } from '@/lib/access-control'
import { canAccessUserProfile } from '@/lib/user-access'
import { prisma } from '@/lib/prisma'
import { validateCsrfOrigin } from '@/lib/csrf'
import type { Role } from '@prisma/client'

export type AuthSession = Session & {
  user: NonNullable<Session['user']> & { id: string }
}

export function isGuardResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse
}

/** CSRF origin check for mutation handlers — returns 403 response or null if OK. */
export function requireCsrf(req: NextRequest): NextResponse | null {
  return validateCsrfOrigin(req)
}

export async function requireAuth(): Promise<AuthSession | NextResponse> {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return session as AuthSession
}

export async function requirePermission(
  permission: AppPermission,
): Promise<AuthSession | NextResponse> {
  const session = await requireAuth()
  if (isGuardResponse(session)) return session
  if (!hasPermission(session.user.role as Role, permission)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return session
}

export async function requireRoles(
  roles: Role[],
): Promise<AuthSession | NextResponse> {
  const session = await requireAuth()
  if (isGuardResponse(session)) return session
  if (!roles.includes(session.user.role as Role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return session
}

/** Whether actor may access target user's profile (org hierarchy). */
export async function requireOrgScope(
  targetUserId: string,
): Promise<AuthSession | NextResponse> {
  const session = await requireAuth()
  if (isGuardResponse(session)) return session
  const allowed = await canAccessUserProfile(
    prisma,
    session.user.id,
    session.user.role as Role,
    session.user.branchId,
    targetUserId,
  )
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return session
}
