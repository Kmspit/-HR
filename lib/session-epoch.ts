import { prisma } from '@/lib/prisma'

/** Bump to invalidate all existing JWT sessions for this user. */
export async function bumpSessionEpoch(userId: string): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE users SET sessionEpoch = COALESCE(sessionEpoch, 0) + 1 WHERE id = ?`,
      userId,
    )
  } catch {
    // column may not exist on older DBs — non-fatal
  }
}

export async function getSessionEpoch(userId: string): Promise<number> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ sessionEpoch: number | null }[]>(
      `SELECT sessionEpoch FROM users WHERE id = ? LIMIT 1`,
      userId,
    )
    return rows[0]?.sessionEpoch ?? 0
  } catch {
    return 0
  }
}
