import { prisma } from '@/lib/prisma'
import type { EmploymentAssignment } from '@prisma/client'

/**
 * The assignment in effect on a given date — the most recent row whose
 * effectiveFrom is on or before `date`. There's no effectiveTo column (see
 * schema.prisma's comment on EmploymentAssignment): storing one would drift
 * out of sync whenever history gets edited retroactively, so "current as of
 * date" is always derived from ordering, never read off a stored range.
 *
 * Not wired into anything yet — this is Phase 1 step 4's schema-only groundwork.
 */
export async function getAssignmentAsOf(userId: string, date: Date): Promise<EmploymentAssignment | null> {
  return prisma.employmentAssignment.findFirst({
    where: { userId, effectiveFrom: { lte: date } },
    orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
  })
}
