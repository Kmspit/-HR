import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { assertLineFieldsUnique, normalizeLineDisplayName, normalizeLineUserId } from '@/lib/line-profile'
import { getLineUserProfile } from '@/lib/line-api'

const CODE_TTL_MS = 15 * 60 * 1000

export async function ensureLineLinkTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS line_link_codes (
      id TEXT NOT NULL PRIMARY KEY,
      userId TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      expiresAt DATETIME NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS line_link_codes_user_idx ON line_link_codes (userId)
  `)
}

function makeCode(): string {
  return randomBytes(3).toString('hex').toUpperCase()
}

export async function createLineLinkCode(userId: string): Promise<{ code: string; expiresAt: Date }> {
  await ensureLineLinkTable()
  const expiresAt = new Date(Date.now() + CODE_TTL_MS)
  const code = makeCode()

  await prisma.$executeRaw`DELETE FROM line_link_codes WHERE userId = ${userId}`
  const id = `llc_${randomBytes(12).toString('hex')}`
  await prisma.$executeRaw`
    INSERT INTO line_link_codes (id, userId, code, expiresAt, createdAt)
    VALUES (${id}, ${userId}, ${code}, ${expiresAt.toISOString()}, datetime('now'))
  `

  return { code, expiresAt }
}

export async function findUserByLineUserId(lineUserId: string) {
  return prisma.user.findFirst({
    where: { lineUserId },
    select: { id: true, name: true, email: true, status: true },
  })
}

export type LinkFromLineResult =
  | { ok: true; userName: string }
  | { ok: false; message: string }

/** ผูก LINE User ID กับพนักงานด้วยรหัสจากหน้าโปรไฟล์ */
export async function linkLineUserWithCode(
  lineUserId: string,
  rawCode: string,
): Promise<LinkFromLineResult> {
  await ensureLineLinkTable()

  const normalizedUid = normalizeLineUserId(lineUserId)
  if (!normalizedUid) {
    return { ok: false, message: 'ไม่พบ LINE User ID' }
  }

  const code = rawCode.trim().toUpperCase().replace(/\s/g, '')
  if (!/^[A-F0-9]{6}$/.test(code)) {
    return { ok: false, message: 'รหัสไม่ถูกต้อง — ใช้รหัส 6 ตัวจากหน้าโปรไฟล์ HRFlow' }
  }

  const rows = await prisma.$queryRaw<
    { userId: string; expiresAt: string }[]
  >`SELECT userId, expiresAt FROM line_link_codes WHERE code = ${code} LIMIT 1`

  const row = rows[0]
  if (!row) {
    return { ok: false, message: 'รหัสไม่พบหรือหมดอายุ — สร้างรหัสใหม่ในแอป' }
  }

  if (new Date(row.expiresAt) < new Date()) {
    await prisma.$executeRaw`DELETE FROM line_link_codes WHERE code = ${code}`
    return { ok: false, message: 'รหัสหมดอายุแล้ว — สร้างรหัสใหม่ในแอป (อายุ 15 นาที)' }
  }

  const existing = await findUserByLineUserId(normalizedUid)
  if (existing && existing.id !== row.userId) {
    return { ok: false, message: 'บัญชี LINE นี้ผูกกับพนักงานคนอื่นแล้ว' }
  }

  const unique = await assertLineFieldsUnique(
    { lineId: null, lineUserId: normalizedUid },
    row.userId,
  )
  if (!unique.ok) {
    return { ok: false, message: unique.error }
  }

  const profile = await getLineUserProfile(normalizedUid)
  const lineDisplayName = profile?.displayName
    ? normalizeLineDisplayName(profile.displayName)
    : null

  const user = await prisma.user.update({
    where: { id: row.userId },
    data: {
      lineUserId: normalizedUid,
      ...(lineDisplayName ? { lineDisplayName } : {}),
    },
    select: { name: true, status: true },
  })

  if (user.status !== 'ACTIVE') {
    return { ok: false, message: 'บัญชีพนักงานยังไม่เปิดใช้งาน — ติดต่อ HR' }
  }

  await prisma.$executeRaw`DELETE FROM line_link_codes WHERE userId = ${row.userId}`

  return { ok: true, userName: user.name }
}

export async function unlinkLineUser(lineUserId: string): Promise<boolean> {
  const normalizedUid = normalizeLineUserId(lineUserId)
  if (!normalizedUid) return false

  const result = await prisma.user.updateMany({
    where: { lineUserId: normalizedUid },
    data: { lineUserId: null, lineDisplayName: null },
  })
  return result.count > 0
}

export function extractLinkCodeFromMessage(text: string): string | null {
  const t = text.trim()
  const m1 = t.match(/^(?:ลิงก์|link)\s+([A-Fa-f0-9]{6})$/i)
  if (m1) return m1[1].toUpperCase()
  if (/^[A-F0-9]{6}$/.test(t)) return t
  return null
}
