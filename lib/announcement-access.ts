type UserOrgFields = {
  branchId?: string | null
  divisionId?: string | null
  departmentId?: string | null
  sectionId?: string | null
}

/** Whether a user may see an announcement given its audience targeting.
 * `targetIds` must already be a parsed array, not the raw JSON-string DB column.
 *
 * Single source of truth for this check — the list route (including its archive
 * branch) and the SSE broadcast filter both call this, so they can't drift apart
 * again the way the SSE fan-out previously bypassed targeting entirely. */
export function matchesAnnouncementTargeting(
  targetType: string,
  targetIds: string[],
  userId: string,
  user: UserOrgFields | null,
): boolean {
  if (targetType === 'ALL') return true
  if (targetIds.length === 0) return false
  switch (targetType) {
    case 'INDIVIDUAL': return targetIds.includes(userId)
    case 'BRANCH':     return !!user?.branchId && targetIds.includes(user.branchId)
    case 'DIVISION':   return !!user?.divisionId && targetIds.includes(user.divisionId)
    case 'DEPARTMENT': return !!user?.departmentId && targetIds.includes(user.departmentId)
    case 'SECTION':    return !!user?.sectionId && targetIds.includes(user.sectionId)
    default:            return true
  }
}
