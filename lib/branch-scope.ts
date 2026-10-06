import type { Prisma, PrismaClient, Role } from '@prisma/client'
import { HR_ADMIN } from '@/lib/module-gates'

export type BranchScopeInput = {
  role: Role
  userBranchId: string | null | undefined
  /** จาก ?branchId= สำหรับ role ใน ALL_BRANCHES_ROLES — ค่า `all` หรือไม่ส่ง = ทุกสาขา */
  filterBranchId?: string | null
}

/**
 * Roles that may see "all branches" (no filter) when no explicit ?branchId=
 * is given — every other role is locked to its own branch below, and any
 * ?branchId= they pass is ignored. 2026-10 fail-close: this used to be
 * "every role except EMPLOYEE/LAWYER", which let MANAGER/TEAM_LEADER/
 * ENFORCEMENT/CLIENT see company-wide data at ~10 call sites with no
 * legitimate multi-branch use case (see fix/branch-scope-fail-closed audit).
 */
export const ALL_BRANCHES_ROLES: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

/**
 * Returned by resolveFilterBranchId for a non-allow-listed role with no
 * branchId of its own. Must never equal a real CompanyBranch id (those are
 * cuid()-generated) — used as an ordinary branchId filter value so every
 * `branchId ? { branchId } : {}`-style caller naturally matches zero rows
 * instead of falling through to "no filter = all branches".
 */
export const NO_BRANCH_ACCESS_ID = '__no_branch_access__'

/** สาขาที่ใช้กรองข้อมูล — undefined = ทุกสาขา (เฉพาะ ALL_BRANCHES_ROLES) */
export function resolveFilterBranchId(scope: BranchScopeInput): string | undefined {
  if (!ALL_BRANCHES_ROLES.includes(scope.role)) {
    return scope.userBranchId ?? NO_BRANCH_ACCESS_ID
  }
  const f = scope.filterBranchId?.trim()
  if (!f || f === 'all') return undefined
  return f
}

export function canPickBranchFilter(role: Role): boolean {
  return role === 'MANAGER_HR' || role === 'ADMIN' || role === 'CEO'
}

export function canManageBranches(role: Role): boolean {
  return HR_ADMIN.includes(role)
}

/** เงื่อนไข user ตามสาขา */
export function branchUserWhere(
  scope: BranchScopeInput,
  extra?: Prisma.UserWhereInput,
): Prisma.UserWhereInput {
  const branchId = resolveFilterBranchId(scope)
  const base: Prisma.UserWhereInput = { ...extra }
  if (branchId) base.branchId = branchId
  return base
}

/** กรองผ่าน relation user (leave, attendance ฯลฯ) */
export function branchNestedUserWhere(
  scope: BranchScopeInput,
): Prisma.UserWhereInput | undefined {
  const branchId = resolveFilterBranchId(scope)
  if (!branchId) return undefined
  return { branchId }
}

export function parseBranchQueryParam(
  value: string | string[] | undefined,
): string | undefined {
  if (!value || Array.isArray(value)) return undefined
  return value
}

export function buildBranchScope(
  user: { role: Role; branchId?: string | null },
  searchParams?: { branchId?: string },
): BranchScopeInput {
  return {
    role: user.role,
    userBranchId: user.branchId ?? null,
    filterBranchId: searchParams?.branchId,
  }
}

/** กรอง attendance ตามสาขาของ user */
export function attendanceWhere(
  scope: BranchScopeInput,
  extra?: Prisma.AttendanceWhereInput,
): Prisma.AttendanceWhereInput {
  const nested = branchNestedUserWhere(scope)
  if (!nested) return { ...extra }
  return { ...extra, user: { ...nested, ...(extra?.user as object) } }
}

/** Whether target user falls within branch filter (HR list scope). */
export async function isUserInBranchScope(
  prisma: PrismaClient,
  scope: BranchScopeInput,
  targetUserId: string,
): Promise<boolean> {
  const found = await prisma.user.findFirst({
    where: branchUserWhere(scope, { id: targetUserId }),
    select: { id: true },
  })
  return !!found
}

/** กรอง leave / outside ตามสาขา */
export function requestUserWhere(
  scope: BranchScopeInput,
  extra?: Prisma.LeaveRequestWhereInput,
): Prisma.LeaveRequestWhereInput {
  const nested = branchNestedUserWhere(scope)
  if (!nested) return { ...extra }
  return { ...extra, user: nested }
}
