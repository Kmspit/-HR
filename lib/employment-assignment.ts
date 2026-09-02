import { prisma } from '@/lib/prisma'
import type { EmploymentAssignment, EmploymentType } from '@prisma/client'

/**
 * The assignment in effect on a given date — the most recent row whose
 * effectiveFrom is on or before `date`. There's no effectiveTo column (see
 * schema.prisma's comment on EmploymentAssignment): storing one would drift
 * out of sync whenever history gets edited retroactively, so "current as of
 * date" is always derived from ordering, never read off a stored range.
 *
 * Deliberately returns a TERMINATION row too if that's genuinely the most
 * recent one as of `date` — that's correct for "what was true on this date"
 * queries. Callers wanting "is this person currently an active employee /
 * what's their current position" must NOT use this directly — use
 * getCurrentAssignment below, which filters TERMINATION out. Using this raw
 * function for a "current position" display would show a departed
 * employee's old position as if they still held it.
 */
export async function getAssignmentAsOf(userId: string, date: Date): Promise<EmploymentAssignment | null> {
  return prisma.employmentAssignment.findFirst({
    where: { userId, effectiveFrom: { lte: date } },
    orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
  })
}

/**
 * "Current position" query — getAssignmentAsOf(userId, now), but null if the
 * most recent assignment is a TERMINATION. Use this (not getAssignmentAsOf
 * directly) anywhere that means to ask "is this person currently employed /
 * what's their current position" — e.g. an employee-list "current position"
 * column, or a defensive "have they already been hired" check before
 * creating a HIRE assignment.
 */
export async function getCurrentAssignment(userId: string): Promise<EmploymentAssignment | null> {
  const assignment = await getAssignmentAsOf(userId, new Date())
  if (!assignment || assignment.changeType === 'TERMINATION') return null
  return assignment
}

/**
 * EmploymentAssignment.employmentType (Phase 1's enum: FULL_TIME/CONTRACT/
 * PART_TIME/DAILY/INTERN) has no 1:1 predecessor in the legacy
 * User.employeeType string vocabulary (permanent_employee/
 * probation_employee/intern — see lib/access-control's EMPLOYEE_TYPES,
 * which conflates "employment type" with "on probation", something the new
 * enum deliberately keeps separate). FULL_TIME/INTERN map onto an exact
 * existing semantic match; CONTRACT/PART_TIME/DAILY map onto 3 new legacy
 * values added alongside the old ones (additive — nothing already stored
 * changes meaning).
 */
export function mapEmploymentTypeToLegacy(type: EmploymentType): string {
  const map: Record<EmploymentType, string> = {
    FULL_TIME: 'permanent_employee',
    CONTRACT: 'contract_employee',
    PART_TIME: 'part_time_employee',
    DAILY: 'daily_employee',
    INTERN: 'intern',
  }
  return map[type]
}
