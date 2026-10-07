import type { Session } from 'next-auth'
import type { Role, UserStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { SESSION_UNAVAILABLE_DIGEST } from '@/lib/session-constants'

export { SESSION_UNAVAILABLE_DIGEST, SESSION_EXPIRED_REASON } from '@/lib/session-constants'

/** ตรวจ session กับ DB ไม่ได้ (DB ล่ม/timeout) — ไม่ใช่ "session ใช้ไม่ได้"
 *  API ต้องตอบ 503 และห้ามลบ cookie ผู้ใช้จะได้ไม่หลุดเพราะ DB สะดุดชั่วคราว */
export class SessionUnavailableError extends Error {
  readonly digest = SESSION_UNAVAILABLE_DIGEST
  constructor(cause?: unknown) {
    super('ตรวจสอบ session ไม่ได้ชั่วคราว (ฐานข้อมูลขัดข้อง)', { cause })
    this.name = 'SessionUnavailableError'
  }
}

export function isSessionUnavailableError(err: unknown): err is SessionUnavailableError {
  return (
    err instanceof SessionUnavailableError ||
    (typeof err === 'object' && err !== null && (err as { digest?: unknown }).digest === SESSION_UNAVAILABLE_DIGEST)
  )
}

export const SESSION_CHECK_TIMEOUT_MS = 5000

type SessionRow = {
  status: UserStatus
  role: Role
  branchId: string | null
  department: string | null
  sessionEpoch: number | bigint | null
}

async function loadSessionRow(userId: string): Promise<SessionRow | null> {
  // sessionEpoch ไม่อยู่ใน schema.prisma (เพิ่มโดย ensureDbSchema) → ต้องใช้ raw SQL
  try {
    const rows = await prisma.$queryRawUnsafe<SessionRow[]>(
      `SELECT status, role, branchId, department, sessionEpoch FROM users WHERE id = ? LIMIT 1`,
      userId,
    )
    return rows[0] ?? null
  } catch (err) {
    // DB ในเครื่องที่สร้างด้วย `prisma db push` ไม่มีคอลัมน์ sessionEpoch — ถือว่า epoch = 0
    if (!/no such column:?\s*"?sessionEpoch/i.test(String((err as Error)?.message ?? err))) throw err
    const rows = await prisma.$queryRawUnsafe<SessionRow[]>(
      `SELECT status, role, branchId, department, 0 AS sessionEpoch FROM users WHERE id = ? LIMIT 1`,
      userId,
    )
    return rows[0] ?? null
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`session check timed out after ${ms}ms`)), ms)
  })
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer))
}

/**
 * ตรวจ session (จาก JWT) กับ DB หนึ่ง query ต่อการเรียก
 *   - ไม่มี session / ไม่พบ user / status ไม่ใช่ ACTIVE / sessionEpoch ไม่ตรง → null
 *   - ผ่าน → คืน session ที่ role/status/branchId/department มาจาก DB (ไม่เชื่อค่าใน JWT)
 *   - DB error / timeout → throw SessionUnavailableError
 * ไม่ตรวจ lockedUntil — การล็อกจากใส่รหัสผิดกันแค่การ login ใหม่ ไม่เตะคนที่ใช้งานอยู่
 * (ไม่งั้นใครก็ใส่รหัสผิดรัว ๆ เพื่อเตะผู้ใช้จริงออกได้)
 */
export async function validateSessionAgainstDb(session: Session | null): Promise<Session | null> {
  const userId = session?.user?.id
  if (!session || !userId) return null

  let row: SessionRow | null
  try {
    row = await withTimeout(loadSessionRow(userId), SESSION_CHECK_TIMEOUT_MS)
  } catch (err) {
    console.error('[session-validate] DB check failed', err)
    throw new SessionUnavailableError(err)
  }

  if (!row || row.status !== 'ACTIVE') return null
  const tokenEpoch = Number((session.user as { sessionEpoch?: number }).sessionEpoch ?? 0)
  if (tokenEpoch !== Number(row.sessionEpoch ?? 0)) return null

  return {
    ...session,
    user: {
      ...session.user,
      role: row.role,
      status: row.status,
      branchId: row.branchId,
      department: row.department,
    },
  }
}
