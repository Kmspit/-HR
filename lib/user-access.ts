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
  if (!canManageUserProfile(viewerRole)) return false
  return canViewEmployeeTimeline(
    prisma,
    viewerId,
    viewerRole,
    viewerBranchId,
    targetUserId,
  )
}

/** Whether viewer may PATCH another user's HR record. */
export async function canEditUserProfile(
  prisma: PrismaClient,
  viewerId: string,
  viewerRole: Role,
  viewerBranchId: string | null | undefined,
  targetUserId: string,
): Promise<boolean> {
  if (viewerId === targetUserId) return true
  return canAccessUserProfile(
    prisma,
    viewerId,
    viewerRole,
    viewerBranchId,
    targetUserId,
  )
}
