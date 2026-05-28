/** ป้ายฟิลด์สำหรับประวัติการแก้ไขโปรไฟล์ */
const PROFILE_FIELD_LABELS: Record<string, string> = {
  email: 'อีเมล',
  phone: 'เบอร์โทร',
  name: 'ชื่อ-นามสกุล',
  prefix: 'คำนำหน้า',
  nickname: 'ชื่อเล่น',
  address: 'ที่อยู่',
  birthDate: 'วันเกิด',
  nationalId: 'เลขบัตรประชาชน',
  lineId: 'LINE ID',
  profileImage: 'รูปโปรไฟล์',
}

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null
  try {
    const o = JSON.parse(raw) as unknown
    return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function formatValue(key: string, val: unknown): string {
  if (val == null || val === '') return '—'
  if (key === 'birthDate' && typeof val === 'string') {
    const d = new Date(val)
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
    }
  }
  if (key === 'profileImage') return 'เปลี่ยนรูปแล้ว'
  return String(val)
}

/** สรุปฟิลด์ที่เปลี่ยนจาก audit before/after */
export function summarizeProfileChanges(beforeRaw: string | null, afterRaw: string | null): string[] {
  const before = parseJsonObject(beforeRaw)
  const after = parseJsonObject(afterRaw)
  if (!before || !after) return []

  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const lines: string[] = []
  for (const key of keys) {
    const b = before[key]
    const a = after[key]
    if (JSON.stringify(b) === JSON.stringify(a)) continue
    const label = PROFILE_FIELD_LABELS[key] ?? key
    lines.push(`${label}: ${formatValue(key, b)} → ${formatValue(key, a)}`)
  }
  return lines
}

export type ProfileHistoryItem = {
  id: string
  at: string
  actorName: string
  changes: string[]
}

export function mapProfileAuditLogs(
  logs: {
    id: string
    createdAt: Date
    before: string | null
    after: string | null
    actor: { name: string }
  }[],
): ProfileHistoryItem[] {
  return logs
    .map((log) => ({
      id: log.id,
      at: log.createdAt.toISOString(),
      actorName: log.actor.name,
      changes: summarizeProfileChanges(log.before, log.after),
    }))
    .filter((item) => item.changes.length > 0)
}

/** สแนปช็อตฟิลด์ที่บันทึกใน audit (ไม่รวมรหัสผ่าน/สิทธิ์) */
export function snapshotProfileForAudit(u: {
  email: string
  phone: string | null
  name: string
  prefix: string | null
  nickname: string | null
  address: string | null
  birthDate: Date | null
  nationalId: string | null
  lineId: string | null
  profileImage: string | null
}) {
  return {
    email: u.email,
    phone: u.phone,
    name: u.name,
    prefix: u.prefix,
    nickname: u.nickname,
    address: u.address,
    birthDate: u.birthDate?.toISOString().slice(0, 10) ?? null,
    nationalId: u.nationalId,
    lineId: u.lineId,
    profileImage: u.profileImage ? '(มีรูป)' : null,
  }
}
