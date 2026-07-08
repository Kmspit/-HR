import type { PrismaClient, Role } from '@prisma/client'
import { canManageUserProfile } from '@/lib/role-assignment'
import { canViewEmployeeTimeline } from '@/lib/employee-timeline/access'

/** Whether viewer may read another user's profile (API GET / employees view). */
export async function canAccessUserProfile(
  prisma: PrismaClient,
  viewerId: string,
  viewerRole: Role,
  viewerBranchId: string | null | undefined,
  targetUserId: string,
): Promise<boolean> {
  if (viewerId === targetUserId) return true
  if (viewerRole === 'MANAGER' || viewerRole === 'TEAM_LEADER') {
    return canViewEmployeeTimeline(
      prisma,
      viewerId,
      viewerRole,
      viewerBranchId,
      targetUserId,
    )
  }
  if (!canManageUserProfile(viewerRole)) return false
  return canViewEmployeeTimeline(
    prisma,
    viewerId,
    viewerRole,
    viewerBranchId,
    targetUserId,
  )
}

/**
 * Whether viewer may PATCH another user's HR record (name, salary, department,
 * role, status, etc.) — stricter than canAccessUserProfile (view-only). A
 * MANAGER/TEAM_LEADER passes canAccessUserProfile for their own direct reports
 * (so they can view the employee timeline), but that alone must NOT be enough
 * to edit fields like baseSalary — canManageUserProfile is the same role list
 * the employees/[id] edit page itself gates on, so this keeps the API in sync
 * with what the UI actually shows.
 */
export async function canEditUserProfile(
  prisma: PrismaClient,
  viewerId: string,
  viewerRole: Role,
  viewerBranchId: string | null | undefined,
  targetUserId: string,
): Promise<boolean> {
  if (viewerId === targetUserId) return true
  if (!canManageUserProfile(viewerRole)) return false
  return canViewEmployeeTimeline(
    prisma,
    viewerId,
    viewerRole,
    viewerBranchId,
    targetUserId,
  )
}
