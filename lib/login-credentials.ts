import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import type { Role, UserStatus } from '@prisma/client'

export type LoginResult =
  | {
      ok: true
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
  | { ok: false; error: string }

/** ตรวจสอบอีเมลหรือรหัสพนักงาน + รหัสผ่าน */
export async function verifyLoginCredentials(
  identifier: string,
  password: string,
): Promise<LoginResult> {
  const raw = identifier.trim()
  if (!raw || !password) {
    return { ok: false, error: 'MISSING_FIELDS' }
  }

  let user
  try {
    const isEmail = raw.includes('@')
    user = await prisma.user.findFirst({
      where: isEmail
        ? { email: raw.toLowerCase() }
        : {
            OR: [
              { employeeId: raw },
              { employeeId: raw.toUpperCase() },
              { employeeId: raw.toLowerCase() },
            ],
          },
    })
  } catch (err) {
    console.error('[verifyLoginCredentials] db', err)
    return { ok: false, error: 'SERVER_ERROR' }
  }

  if (!user) return { ok: false, error: 'INVALID_CREDENTIALS' }
  if (user.status === 'PENDING') return { ok: false, error: 'PENDING_APPROVAL' }
  if (user.status === 'DISABLED') return { ok: false, error: 'ACCOUNT_DISABLED' }
  if (user.status === 'REJECTED') return { ok: false, error: 'ACCOUNT_REJECTED' }

  if (!user.passwordHash?.startsWith('$2')) {
    return { ok: false, error: 'INVALID_CREDENTIALS' }
  }

  let isValid = false
  try {
    isValid = await bcrypt.compare(password, user.passwordHash)
  } catch (bcryptErr) {
    console.error('[verifyLoginCredentials] bcrypt.compare', bcryptErr)
    return { ok: false, error: 'SERVER_ERROR' }
  }
  if (!isValid) return { ok: false, error: 'INVALID_CREDENTIALS' }

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      department: user.department,
      branchId: user.branchId,
    },
  }
}
