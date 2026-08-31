import { maskNationalId, nationalIdFingerprint } from '@/lib/national-id'
import { createAuditLog } from '@/lib/notifications'

/**
 * Every field an HR/Admin can write to another employee's record, via either
 * PATCH /api/users/[id] or PATCH /api/users/[id]/org — deliberately kept as
 * one shared select/snapshot pair since the two routes edit the same record
 * and a single audit trail per employee is easier to review than two.
 */
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
} as const

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
