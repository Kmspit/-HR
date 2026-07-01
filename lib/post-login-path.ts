import type { Role, UserStatus } from '@prisma/client'
import { ROLE_DEFAULT_ROUTE } from '@/lib/access-control'
import { hasOrgAssignment, needsOrgAssignment } from '@/lib/user-org'

export type PostLoginUser = {
  role: Role
  status: UserStatus
  divisionId?: string | null
  departmentId?: string | null
  sectionId?: string | null
}

export function resolvePostLoginPath(user: PostLoginUser): {
  path: string
  message: string | null
} {
  if (user.status === 'PENDING') {
    return {
      path: '/',
      message: 'บัญชีของคุณรอการอนุมัติจาก HR',
    }
  }
  if (user.status === 'DISABLED') {
    return {
      path: '/?status=disabled',
      message: 'บัญชีนี้ถูกระงับการใช้งาน',
    }
  }
  if (user.status === 'REJECTED') {
    return {
      path: '/?status=rejected',
      message: 'คำขอสมัครถูกปฏิเสธ',
    }
  }

  if (needsOrgAssignment(user.role) && !hasOrgAssignment(user)) {
    const base = ROLE_DEFAULT_ROUTE[user.role] ?? '/dashboard'
    return {
      path: `${base}?setup=org`,
      message:
        'เข้าสู่ระบบสำเร็จ — รอ HR กำหนดฝ่าย/แผนกเพื่อใช้งานครบทุกเมนู',
    }
  }

  return {
    path: ROLE_DEFAULT_ROUTE[user.role] ?? '/dashboard',
    message: null,
  }
}
