import { prisma } from '@/lib/prisma'

/** LINE ID (@username) — ใช้ตอนสมัครและแจ้งเตือน */
export function normalizeLineId(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  const id = t.startsWith('@') ? t : `@${t}`
  const body = id.slice(1)
  if (!/^[a-zA-Z0-9._-]{4,32}$/.test(body)) return null
  return `@${body.toLowerCase()}`
}

/** LINE User ID จาก Messaging API (U + 32 hex) */
export function normalizeLineUserId(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  if (!/^U[a-fA-F0-9]{32}$/.test(t)) return null
  return t
}

export function normalizeLineDisplayName(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  if (t.length < 1 || t.length > 100) return null
  return t
}

export type LineFieldInput = {
  lineId?: string | null
  lineUserId?: string | null
  lineDisplayName?: string | null
}

export type ParsedLineFields =
  | {
      ok: true
      lineId: string | null
      lineUserId: string | null
      lineDisplayName: string | null
    }
  | { ok: false; error: string; field?: string }

/** ตรวจและแปลงค่า LINE — requireLineId สำหรับสมัคร */
export function parseLineFields(
  input: LineFieldInput,
  options?: { requireLineId?: boolean; allowUserId?: boolean; allowDisplayName?: boolean },
): ParsedLineFields {
  const requireLineId = options?.requireLineId ?? false
  const allowUserId = options?.allowUserId ?? true
  const allowDisplayName = options?.allowDisplayName ?? true

  let lineId: string | null = null
  if (input.lineId != null && String(input.lineId).trim() !== '') {
    lineId = normalizeLineId(String(input.lineId))
    if (!lineId) {
      return {
        ok: false,
        field: 'lineId',
        error: 'LINE ID ไม่ถูกต้อง — ใช้ @username ภาษาอังกฤษ 4–32 ตัว (เช่น @kmsp.hr)',
      }
    }
  } else if (requireLineId) {
    return { ok: false, field: 'lineId', error: 'กรุณากรอก LINE ID' }
  }

  let lineUserId: string | null = null
  if (allowUserId && input.lineUserId != null && String(input.lineUserId).trim() !== '') {
    lineUserId = normalizeLineUserId(String(input.lineUserId))
    if (!lineUserId) {
      return {
        ok: false,
        field: 'lineUserId',
        error: 'LINE User ID ไม่ถูกต้อง — รูปแบบ Uxxxxxxxx (32 ตัว)',
      }
    }
  }

  let lineDisplayName: string | null = null
  if (allowDisplayName && input.lineDisplayName != null && String(input.lineDisplayName).trim() !== '') {
    lineDisplayName = normalizeLineDisplayName(String(input.lineDisplayName))
    if (!lineDisplayName) {
      return { ok: false, field: 'lineDisplayName', error: 'ชื่อแสดงใน LINE ต้องไม่เกิน 100 ตัวอักษร' }
    }
  }

  return { ok: true, lineId, lineUserId, lineDisplayName }
}

/** ตรวจซ้ำ lineId / lineUserId (ยกเว้น user ปัจจุบัน) */
export async function assertLineFieldsUnique(
  parsed: { lineId: string | null; lineUserId: string | null },
  excludeUserId?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (parsed.lineId) {
    const dup = await prisma.user.findFirst({
      where: {
        lineId: parsed.lineId,
        ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}),
      },
      select: { id: true },
    })
    if (dup) return { ok: false, error: 'LINE ID นี้มีในระบบแล้ว' }
  }
  if (parsed.lineUserId) {
    const dup = await prisma.user.findFirst({
      where: {
        lineUserId: parsed.lineUserId,
        ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}),
      },
      select: { id: true },
    })
    if (dup) return { ok: false, error: 'LINE User ID นี้ผูกกับพนักงานคนอื่นแล้ว' }
  }
  return { ok: true }
}

/** ปลายทางส่ง LINE Messaging (อนาคตใช้ lineUserId ก่อน) */
export function lineNotifyTarget(user: {
  lineUserId?: string | null
  lineId?: string | null
}): string | null {
  return user.lineUserId ?? user.lineId ?? null
}
