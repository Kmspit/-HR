import { auth } from '@/lib/auth'
import type { Role, UserStatus } from '@prisma/client'
import { isSessionUnavailableError } from '@/lib/session-validate'

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

/** auth() ตรวจ status/role/sessionEpoch กับ DB ให้แล้ว (lib/session-validate.ts) —
 *  ตัวนี้แค่แปลงผลเป็นรูป { ok, status } สำหรับ route ที่อยากได้ status code ตรง ๆ */
export async function requireActiveStaffSession(): Promise<
  { ok: true; session: ActiveStaffSession } | { ok: false; status: 401 | 503; error: string }
> {
  let session
  try {
    session = await auth()
  } catch (err) {
    if (isSessionUnavailableError(err)) return { ok: false, status: 503, error: 'ระบบขัดข้องชั่วคราว' }
    throw err
  }
  if (!session?.user?.id) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }
  const u = session.user
  return {
    ok: true,
    session: {
      user: {
        id: u.id,
        email: u.email ?? '',
        name: u.name ?? '',
        role: u.role,
        status: u.status,
        department: u.department,
        branchId: u.branchId,
      },
    },
  }
}
