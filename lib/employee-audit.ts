import { maskNationalId, nationalIdFingerprint } from '@/lib/national-id'
import { createAuditLog } from '@/lib/notifications'
import { ROLE_LABELS } from '@/lib/access-control'
import { USER_STATUS_LABEL } from '@/lib/status-labels'
import type { Role } from '@prisma/client'

/**
 * Every field an HR/Admin can write to another employee's record, via either
 * PATCH /api/users/[id] or PATCH /api/users/[id]/org — deliberately kept as
 * one shared select/snapshot pair since the two routes edit the same record
 * and a single audit trail per employee is easier to review than two.
 */
// Phase 1 step 8a — EmployeeProfile (nationality/maritalStatus/personalEmail
// + the 16 structured address sub-fields) joins into the SAME shared select
// rather than getting its own audit trail, per this file's own design intent
// above ("a single audit trail per employee is easier to review than two").
// All 16 address sub-fields are tracked here (nothing is silently dropped
// from the audit DATA), but summarizeEmployeeChanges() below deliberately
// does NOT display them one line per field — see ADDRESS_DETAIL_FIELDS for
// why (a multi-field address edit produced one near-duplicate line per
// field, on top of the User.address/addressIdCard concat line that already
// shows the same before/after in full).
const EMPLOYEE_PROFILE_AUDIT_SELECT = {
  nationality: true,
  maritalStatus: true,
  personalEmail: true,
  currentHouseNo: true,
  currentMoo: true,
  currentSoi: true,
  currentRoad: true,
  currentTambon: true,
  currentAmphoe: true,
  currentProvince: true,
  currentPostalCode: true,
  sameAsCurrentAddress: true,
  regHouseNo: true,
  regMoo: true,
  regSoi: true,
  regRoad: true,
  regTambon: true,
  regAmphoe: true,
  regProvince: true,
  regPostalCode: true,
} as const

export const EMPLOYEE_AUDIT_SELECT = {
  email: true,
  phone: true,
  name: true,
  nameEn: true,
  nickname: true,
  prefix: true,
  address: true,
  addressIdCard: true,
  birthDate: true,
  nationalId: true,
  lineId: true,
  role: true,
  status: true,
  startDate: true,
  department: true,
  position: true,
  employeeType: true,
  managerId: true,
  teamLeaderId: true,
  baseSalary: true,
  socialSecurity: true,
  isCoworker: true,
  divisionId: true,
  sectionId: true,
  employeeProfile: { select: EMPLOYEE_PROFILE_AUDIT_SELECT },
} as const

type EmployeeProfileAuditRow = {
  nationality: string | null
  maritalStatus: string | null
  personalEmail: string | null
  currentHouseNo: string | null
  currentMoo: string | null
  currentSoi: string | null
  currentRoad: string | null
  currentTambon: string | null
  currentAmphoe: string | null
  currentProvince: string | null
  currentPostalCode: string | null
  sameAsCurrentAddress: boolean
  regHouseNo: string | null
  regMoo: string | null
  regSoi: string | null
  regRoad: string | null
  regTambon: string | null
  regAmphoe: string | null
  regProvince: string | null
  regPostalCode: string | null
}

type EmployeeAuditRow = {
  email: string
  phone: string | null
  name: string
  nameEn: string | null
  nickname: string | null
  prefix: string | null
  address: string | null
  addressIdCard: string | null
  birthDate: Date | null
  nationalId: string | null
  lineId: string | null
  role: string
  status: string
  startDate: Date | null
  department: string | null
  position: string | null
  employeeType: string | null
  managerId: string | null
  teamLeaderId: string | null
  baseSalary: number | null
  socialSecurity: boolean
  isCoworker: boolean
  divisionId: string | null
  sectionId: string | null
  /** Nullable — a legacy employee (pre step 5/6) may not have an
   *  EmployeeProfile row yet; every profile field snapshots to null until
   *  HR fills the tab in for the first time (see the profile PUT route's
   *  upsert). */
  employeeProfile: EmployeeProfileAuditRow | null
}

/**
 * Separate from snapshotProfileForAudit() (self-edit) on purpose — that
 * function's field set is for a different feature surface (personal contact
 * info an employee edits about themselves). Sharing one function would mean
 * a future field added for self-profile editing could silently end up
 * counted (or silently missing) from this admin-edit trail without anyone
 * intending it.
 *
 * Every field PATCH /api/users/[id] and PATCH /api/users/[id]/org can write
 * must appear here — an audit snapshot that looks complete but silently
 * drops a field (e.g. baseSalary or role) is worse than no snapshot at all,
 * since it gives false confidence that the change was recorded.
 */
export function snapshotEmployeeForAudit(u: EmployeeAuditRow) {
  return {
    email: u.email,
    phone: u.phone,
    name: u.name,
    nameEn: u.nameEn,
    nickname: u.nickname,
    prefix: u.prefix,
    address: u.address,
    addressIdCard: u.addressIdCard,
    birthDate: u.birthDate?.toISOString().slice(0, 10) ?? null,
    // Masked + fingerprint at snapshot time, never the plaintext — same
    // approach as snapshotProfileForAudit() (Phase 0). The fingerprint lets
    // a future diff detect a real change even when two different national
    // IDs happen to mask identically (they share a last digit).
    nationalId: { masked: maskNationalId(u.nationalId).display, fp: nationalIdFingerprint(u.nationalId) },
    lineId: u.lineId,
    role: u.role,
    status: u.status,
    startDate: u.startDate?.toISOString().slice(0, 10) ?? null,
    department: u.department,
    position: u.position,
    employeeType: u.employeeType,
    managerId: u.managerId,
    teamLeaderId: u.teamLeaderId,
    // Plain number, deliberately not masked — lib/employee-timeline/load-data.ts's
    // parseSalaryFromAudit() already expects a real number here (renders
    // "ปรับเงินเดือน ฿X → ฿Y"), and unlike nationalId this needs to stay
    // reviewable in actual figures: the point is being able to check who
    // changed whose pay and by how much, not to hide the number.
    baseSalary: u.baseSalary,
    socialSecurity: u.socialSecurity,
    isCoworker: u.isCoworker,
    divisionId: u.divisionId,
    sectionId: u.sectionId,
    nationality: u.employeeProfile?.nationality ?? null,
    maritalStatus: u.employeeProfile?.maritalStatus ?? null,
    personalEmail: u.employeeProfile?.personalEmail ?? null,
    currentHouseNo: u.employeeProfile?.currentHouseNo ?? null,
    currentMoo: u.employeeProfile?.currentMoo ?? null,
    currentSoi: u.employeeProfile?.currentSoi ?? null,
    currentRoad: u.employeeProfile?.currentRoad ?? null,
    currentTambon: u.employeeProfile?.currentTambon ?? null,
    currentAmphoe: u.employeeProfile?.currentAmphoe ?? null,
    currentProvince: u.employeeProfile?.currentProvince ?? null,
    currentPostalCode: u.employeeProfile?.currentPostalCode ?? null,
    sameAsCurrentAddress: u.employeeProfile?.sameAsCurrentAddress ?? false,
    regHouseNo: u.employeeProfile?.regHouseNo ?? null,
    regMoo: u.employeeProfile?.regMoo ?? null,
    regSoi: u.employeeProfile?.regSoi ?? null,
    regRoad: u.employeeProfile?.regRoad ?? null,
    regTambon: u.employeeProfile?.regTambon ?? null,
    regAmphoe: u.employeeProfile?.regAmphoe ?? null,
    regProvince: u.employeeProfile?.regProvince ?? null,
    regPostalCode: u.employeeProfile?.regPostalCode ?? null,
  }
}

export type EmployeeAuditSnapshot = ReturnType<typeof snapshotEmployeeForAudit>

/** Writes a targetType:'User' UPDATE audit log only if something actually
 *  changed — mirrors the diff-before-write guard in /api/profile so saving
 *  a form with no real edits doesn't create log noise. */
export async function logEmployeeUpdateIfChanged(params: {
  actorId: string
  targetId: string
  before: EmployeeAuditSnapshot
  after: EmployeeAuditSnapshot
  ip: string
  userAgent?: string
}): Promise<void> {
  if (JSON.stringify(params.before) === JSON.stringify(params.after)) return
  await createAuditLog({
    actorId: params.actorId,
    targetId: params.targetId,
    targetType: 'User',
    action: 'UPDATE',
    before: params.before,
    after: params.after,
    ip: params.ip,
    userAgent: params.userAgent,
  })
}

// ── Displaying the trail on /employees/[id]'s "ประวัติการแก้ไข" tab ──────────

/** Date this audit trail started being written — shown in the empty state so
 *  it's clear there's no history before this, not that the feature is broken. */
export const EMPLOYEE_AUDIT_TRACKING_START = '2026-08-31'

const EMPLOYEE_FIELD_LABELS: Record<keyof EmployeeAuditSnapshot, string> = {
  email: 'อีเมล',
  phone: 'เบอร์โทร',
  name: 'ชื่อ-นามสกุล',
  nameEn: 'ชื่อภาษาอังกฤษ',
  nickname: 'ชื่อเล่น',
  prefix: 'คำนำหน้า',
  address: 'ที่อยู่',
  addressIdCard: 'ที่อยู่ตามบัตรประชาชน',
  birthDate: 'วันเกิด',
  nationalId: 'เลขบัตรประชาชน',
  lineId: 'LINE ID',
  role: 'สิทธิ์การใช้งาน (Role)',
  status: 'สถานะบัญชี',
  startDate: 'วันที่เริ่มงาน',
  department: 'แผนก',
  position: 'ตำแหน่ง',
  employeeType: 'ประเภทพนักงาน',
  managerId: 'ผู้จัดการ',
  teamLeaderId: 'หัวหน้าทีม',
  baseSalary: 'เงินเดือนฐาน',
  socialSecurity: 'ประกันสังคม',
  isCoworker: 'พนักงานร่วมงาน',
  divisionId: 'ฝ่าย',
  sectionId: 'ส่วนงาน',
  nationality: 'สัญชาติ',
  maritalStatus: 'สถานภาพสมรส',
  personalEmail: 'อีเมลส่วนตัว',
  currentHouseNo: 'บ้านเลขที่ (ที่อยู่ปัจจุบัน)',
  currentMoo: 'หมู่ (ที่อยู่ปัจจุบัน)',
  currentSoi: 'ซอย (ที่อยู่ปัจจุบัน)',
  currentRoad: 'ถนน (ที่อยู่ปัจจุบัน)',
  currentTambon: 'ตำบล/แขวง (ที่อยู่ปัจจุบัน)',
  currentAmphoe: 'อำเภอ/เขต (ที่อยู่ปัจจุบัน)',
  currentProvince: 'จังหวัด (ที่อยู่ปัจจุบัน)',
  currentPostalCode: 'รหัสไปรษณีย์ (ที่อยู่ปัจจุบัน)',
  sameAsCurrentAddress: 'ที่อยู่ทะเบียนบ้านเหมือนที่อยู่ปัจจุบัน',
  regHouseNo: 'บ้านเลขที่ (ทะเบียนบ้าน)',
  regMoo: 'หมู่ (ทะเบียนบ้าน)',
  regSoi: 'ซอย (ทะเบียนบ้าน)',
  regRoad: 'ถนน (ทะเบียนบ้าน)',
  regTambon: 'ตำบล/แขวง (ทะเบียนบ้าน)',
  regAmphoe: 'อำเภอ/เขต (ทะเบียนบ้าน)',
  regProvince: 'จังหวัด (ทะเบียนบ้าน)',
  regPostalCode: 'รหัสไปรษณีย์ (ทะเบียนบ้าน)',
}

/** Field keys whose value is an id referencing another row (User/Division/
 *  Section) that must be resolved to a name for display, never shown raw. */
const ID_REFERENCE_FIELDS = ['managerId', 'teamLeaderId', 'divisionId', 'sectionId'] as const

/** Name lookups batch-fetched once per request and passed into formatting —
 *  never resolved per-field, since that would mean one query per changed
 *  value per history row. */
export type EmployeeNameLookup = {
  users: Map<string, string>
  divisions: Map<string, string>
  sections: Map<string, string>
}

/** Scans a set of before/after snapshot pairs and returns every id that
 *  needs resolving via EmployeeNameLookup, split by which table to query. */
export function collectReferencedIds(
  snapshots: EmployeeAuditSnapshot[],
): { userIds: string[]; divisionIds: string[]; sectionIds: string[] } {
  const userIds = new Set<string>()
  const divisionIds = new Set<string>()
  const sectionIds = new Set<string>()
  for (const snap of snapshots) {
    if (snap.managerId) userIds.add(snap.managerId)
    if (snap.teamLeaderId) userIds.add(snap.teamLeaderId)
    if (snap.divisionId) divisionIds.add(snap.divisionId)
    if (snap.sectionId) sectionIds.add(snap.sectionId)
  }
  return { userIds: [...userIds], divisionIds: [...divisionIds], sectionIds: [...sectionIds] }
}

function resolveIdReference(field: (typeof ID_REFERENCE_FIELDS)[number], id: string | null, lookup: EmployeeNameLookup): string {
  if (!id) return '—'
  const map = field === 'divisionId' ? lookup.divisions : field === 'sectionId' ? lookup.sections : lookup.users
  return map.get(id) ?? '(ไม่พบข้อมูล)'
}

const currencyFmt = (n: number) => `฿${n.toLocaleString('th-TH')}`

function formatEmployeeValue(key: keyof EmployeeAuditSnapshot, val: unknown, lookup: EmployeeNameLookup): string {
  if (val == null || val === '') return '—'

  if (key === 'nationalId') {
    const v = val as EmployeeAuditSnapshot['nationalId']
    return v.masked
  }
  if (key === 'baseSalary') return currencyFmt(val as number)
  if (key === 'role') return ROLE_LABELS[val as Role] ?? String(val)
  if (key === 'status') return USER_STATUS_LABEL[val as string] ?? String(val)
  if ((ID_REFERENCE_FIELDS as readonly string[]).includes(key)) {
    return resolveIdReference(key as (typeof ID_REFERENCE_FIELDS)[number], val as string, lookup)
  }
  if (key === 'socialSecurity' || key === 'isCoworker' || key === 'sameAsCurrentAddress') return val ? 'ใช่' : 'ไม่ใช่'
  if ((key === 'birthDate' || key === 'startDate') && typeof val === 'string') {
    const d = new Date(val)
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
    }
  }
  return String(val)
}

/**
 * The 16 structured address sub-fields are tracked in full in the snapshot
 * (see EMPLOYEE_PROFILE_AUDIT_SELECT above — nothing is dropped from the
 * audit DATA), but are excluded from the DISPLAYED diff here — `address` /
 * `addressIdCard` (the legacy concatenation, kept in sync by the same PUT
 * that writes these) already show the complete before/after text in one
 * line each. Without this exclusion, editing all 8 fields of one address
 * produced 9 near-duplicate lines (1 concat line + 8 granular ones) for a
 * single logical edit — confirmed against a real 3-field edit on 2026-09-02,
 * which rendered 4 lines for what a reviewer reads as one change. Grouped by
 * address block (not just silently reusing whichever fields happen to
 * differ) so a change is never split across two summaries either.
 */
const ADDRESS_DETAIL_FIELDS = new Set<keyof EmployeeAuditSnapshot>([
  'currentHouseNo', 'currentMoo', 'currentSoi', 'currentRoad',
  'currentTambon', 'currentAmphoe', 'currentProvince', 'currentPostalCode',
  'regHouseNo', 'regMoo', 'regSoi', 'regRoad',
  'regTambon', 'regAmphoe', 'regProvince', 'regPostalCode',
])

/** Diffs two employee snapshots into readable "label: old → new" lines —
 *  separate from summarizeProfileChanges() (self-edit) on purpose, same
 *  reasoning as snapshotEmployeeForAudit() vs snapshotProfileForAudit(). */
export function summarizeEmployeeChanges(
  before: EmployeeAuditSnapshot,
  after: EmployeeAuditSnapshot,
  lookup: EmployeeNameLookup,
): string[] {
  const lines: string[] = []
  for (const key of Object.keys(EMPLOYEE_FIELD_LABELS) as (keyof EmployeeAuditSnapshot)[]) {
    if (ADDRESS_DETAIL_FIELDS.has(key)) continue

    const b = before[key]
    const a = after[key]

    if (key === 'nationalId') {
      const bv = b as EmployeeAuditSnapshot['nationalId']
      const av = a as EmployeeAuditSnapshot['nationalId']
      if (bv.fp === av.fp) continue
      const line = bv.masked === av.masked
        ? `${EMPLOYEE_FIELD_LABELS[key]}: เปลี่ยนแปลง (${av.masked})`
        : `${EMPLOYEE_FIELD_LABELS[key]}: ${bv.masked} → ${av.masked}`
      lines.push(line)
      continue
    }

    if (JSON.stringify(b) === JSON.stringify(a)) continue
    lines.push(`${EMPLOYEE_FIELD_LABELS[key]}: ${formatEmployeeValue(key, b, lookup)} → ${formatEmployeeValue(key, a, lookup)}`)
  }
  return lines
}

export type EmployeeHistoryItem = {
  id: string
  at: string
  actorName: string
  changes: string[]
}

/** EmergencyContact/Dependent/BankAccount are separate tables, not fields of
 *  the User row — CRUD on them (Phase 1 step 8b follow-up) writes into this
 *  SAME trail (targetId: the employee, targetType:'User', action:'UPDATE',
 *  same as every other write here) rather than a second trail, but the
 *  before/after diffing logic above doesn't apply to them. lib/subrecord-
 *  audit.ts's summarizers compute the human-readable lines at WRITE time and
 *  store them directly under `after` with this marker, so mapEmployeeAuditLogs
 *  below can render them without attempting a field diff. */
export type SubrecordEntityType = 'EmergencyContact' | 'Dependent' | 'BankAccount'
export type SubrecordAuditEvent = {
  subrecordEvent: true
  entityType: SubrecordEntityType
  lines: string[]
}

function isSubrecordAuditEvent(v: unknown): v is SubrecordAuditEvent {
  return typeof v === 'object' && v !== null && (v as { subrecordEvent?: unknown }).subrecordEvent === true
}

/** Parses raw AuditLog rows (targetType:'User', action:'UPDATE') into display
 *  items, dropping any entry where nothing recognizable actually changed
 *  (e.g. a legacy row from before a field existed) so the list never shows
 *  an empty-looking card. */
export function mapEmployeeAuditLogs(
  logs: {
    id: string
    createdAt: Date
    before: string | null
    after: string | null
    actor: { name: string } | null
  }[],
  lookup: EmployeeNameLookup,
): EmployeeHistoryItem[] {
  return logs
    .map((log) => {
      let before: unknown = null
      let after: unknown = null
      try {
        before = log.before ? JSON.parse(log.before) : null
        after = log.after ? JSON.parse(log.after) : null
      } catch {
        return null
      }

      if (isSubrecordAuditEvent(after)) {
        if (after.lines.length === 0) return null
        return {
          id: log.id,
          at: log.createdAt.toISOString(),
          actorName: log.actor?.name ?? 'ไม่ทราบ',
          changes: after.lines,
        }
      }

      if (!before || !after) return null
      const changes = summarizeEmployeeChanges(before as EmployeeAuditSnapshot, after as EmployeeAuditSnapshot, lookup)
      if (changes.length === 0) return null
      return {
        id: log.id,
        at: log.createdAt.toISOString(),
        actorName: log.actor?.name ?? 'ไม่ทราบ',
        changes,
      }
    })
    .filter((item): item is EmployeeHistoryItem => item !== null)
}
