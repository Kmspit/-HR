import { prisma } from '@/lib/prisma'
import { normalizeLineId, normalizeLineUserId } from '@/lib/line-profile'

export type HrLineRecipient = { id: string; name: string; lineUserId: string }

function parseNotifyTargetsEnv(): string[] {
  const only = process.env.ATTENDANCE_LINE_NOTIFY_ONLY?.trim()
  const extra = process.env.ATTENDANCE_LINE_NOTIFY_TARGETS?.trim()
  const raw = only || extra
  if (!raw) return []
  return raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)
}

function useOnlyConfiguredTargets(): boolean {
  return !!process.env.ATTENDANCE_LINE_NOTIFY_ONLY?.trim()
}

async function resolveTargetEntry(target: string): Promise<HrLineRecipient | null> {
  const asUserId = normalizeLineUserId(target)
  if (asUserId) {
    const u = await prisma.user.findFirst({
      where: { lineUserId: asUserId, status: 'ACTIVE' },
      select: { id: true, name: true, lineUserId: true },
    })
    return u?.lineUserId
      ? { id: u.id, name: u.name, lineUserId: u.lineUserId }
      : { id: `env:${asUserId}`, name: 'LINE (env User ID)', lineUserId: asUserId }
  }

  const lineId = normalizeLineId(target)
  if (!lineId) return null

  const u = await prisma.user.findFirst({
    where: {
      status: 'ACTIVE',
      OR: [{ lineId }, { lineId: lineId.slice(1) }],
    },
    select: { id: true, name: true, lineUserId: true, lineId: true },
  })

  if (!u?.lineUserId) {
    console.warn('[attendance-line-recipients] LINE ID ยังไม่มี lineUserId — ต้องผูก LINE OA ในแอปก่อน', {
      lineId,
      target,
    })
    return null
  }

  return { id: u.id, name: u.name, lineUserId: u.lineUserId }
}

async function recipientsFromEnvTargets(): Promise<HrLineRecipient[]> {
  const targets = parseNotifyTargetsEnv()
  if (targets.length === 0) return []

  const map = new Map<string, HrLineRecipient>()
  for (const t of targets) {
    const r = await resolveTargetEntry(t)
    if (r) map.set(r.lineUserId, r)
  }
  return [...map.values()]
}

/** HR/Admin ที่ผูก LINE + เป้าหมายจาก env (เช่น @593qdkpk) */
export async function getHrLineRecipients(): Promise<HrLineRecipient[]> {
  const map = new Map<string, HrLineRecipient>()

  if (!useOnlyConfiguredTargets()) {
    const users = await prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        role: { in: ['MANAGER_HR', 'ADMIN'] },
        lineUserId: { not: null },
      },
      select: { id: true, name: true, lineUserId: true },
    })
    for (const u of users) {
      if (u.lineUserId) {
        map.set(u.lineUserId, { id: u.id, name: u.name, lineUserId: u.lineUserId })
      }
    }
  }

  for (const r of await recipientsFromEnvTargets()) {
    map.set(r.lineUserId, r)
  }

  return [...map.values()]
}
