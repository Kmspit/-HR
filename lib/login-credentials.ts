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
  // `error` is what the client sees; `reason` (when present) is the real,
  // more specific cause, kept only for internal logging (loginAttempt.reason)
  // so support/HR can still tell these cases apart without exposing to an
  // unauthenticated caller whether a given email/account exists at all.
  | { ok: false; error: string; reason?: string }

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
    lockedUntil: Date | null
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
        lockedUntil: true,
      },
    })
  } catch (err) {
    console.error('[verifyLoginCredentials] db error:', err)
    return { ok: false, error: 'SERVER_ERROR' }
  }

  if (!user) return { ok: false, error: 'INVALID_CREDENTIALS' }
  // These all return the same generic error as unknown-email/wrong-password —
  // a distinct code/status here (as this used to return) lets an unauthenticated
  // caller enumerate which emails have an account, and PENDING_APPROVAL in
  // particular used to confirm the password was correct. The real reason is
  // still returned via `reason` for internal logging only.
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { ok: false, error: 'INVALID_CREDENTIALS', reason: 'ACCOUNT_LOCKED' }
  }
  if (user.status === 'PENDING') return { ok: false, error: 'INVALID_CREDENTIALS', reason: 'PENDING_APPROVAL' }
  if (user.status === 'DISABLED') return { ok: false, error: 'INVALID_CREDENTIALS', reason: 'ACCOUNT_DISABLED' }
  if (user.status === 'REJECTED') return { ok: false, error: 'INVALID_CREDENTIALS', reason: 'ACCOUNT_REJECTED' }


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
