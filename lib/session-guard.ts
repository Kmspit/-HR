import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Role, UserStatus } from '@prisma/client'
import { getSessionEpoch } from '@/lib/session-epoch'

export type ActiveStaffSession = {
  user: {
    id: string
    email: string
    name: string
    role: Role
    status: UserStatus
    department: string | null
    branchId: string | null
  }
}

/** Re-validates role/status from DB — mitigates stale JWT after disable/demotion. */
export async function requireActiveStaffSession(): Promise<
  { ok: true; session: ActiveStaffSession } | { ok: false; status: 401 | 403; error: string }
> {
  const session = await auth()
  if (!session?.user?.id) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      department: true,
      branchId: true,
      lockedUntil: true,
    },
  })

  if (!dbUser) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }
  if (dbUser.status !== 'ACTIVE') {
    return { ok: false, status: 403, error: 'บัญชีไม่พร้อมใช้งาน' }
  }
  if (dbUser.lockedUntil && dbUser.lockedUntil > new Date()) {
    return { ok: false, status: 403, error: 'บัญชีถูกล็อคชั่วคราว' }
  }

  const tokenEpoch = (session.user as { sessionEpoch?: number }).sessionEpoch ?? 0
  const dbEpoch = await getSessionEpoch(dbUser.id)
  if (tokenEpoch !== dbEpoch) {
    return { ok: false, status: 401, error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' }
  }

  return {
    ok: true,
    session: {
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role: dbUser.role,
        status: dbUser.status,
        department: dbUser.department,
        branchId: dbUser.branchId,
      },
    },
  }
}
