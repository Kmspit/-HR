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

  // Use explicit select to avoid SELECT * — prevents failure on missing columns in Turso
  let user: {
    id: string
    email: string
    name: string
    role: import('@prisma/client').Role
    status: import('@prisma/client').UserStatus
    department: string | null
    branchId: string | null
    passwordHash: string
  } | null = null
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
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        department: true,
        branchId: true,
        passwordHash: true,
      },
    })
  } catch (err) {
    console.error('[verifyLoginCredentials] db error:', err)
    return { ok: false, error: 'SERVER_ERROR' }
  }

  console.log('[LOGIN USER FOUND]', !!user)
  console.log('[USER EMAIL]', user?.email ?? null)
  console.log('[USER ROLE]', user?.role ?? null)
  if (!user) return { ok: false, error: 'INVALID_CREDENTIALS' }
  if (user.status === 'PENDING') return { ok: false, error: 'PENDING_APPROVAL' }
  if (user.status === 'DISABLED') return { ok: false, error: 'ACCOUNT_DISABLED' }
  if (user.status === 'REJECTED') return { ok: false, error: 'ACCOUNT_REJECTED' }

  console.log('[PASSWORD HASH EXISTS]', !!user.passwordHash)
  if (!user.passwordHash?.startsWith('$2')) {
    return { ok: false, error: 'INVALID_CREDENTIALS' }
  }

  let isValid = false
  try {
    isValid = await bcrypt.compare(password, user.passwordHash)
  } catch (bcryptErr) {
    console.error('[verifyLoginCredentials] bcrypt.compare error:', bcryptErr)
    return { ok: false, error: 'SERVER_ERROR' }
  }
  console.log('[PASSWORD MATCH]', isValid)
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
