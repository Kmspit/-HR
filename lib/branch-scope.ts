import type { Prisma, PrismaClient, Role } from '@prisma/client'
import { HR_ADMIN } from '@/lib/module-gates'

export type BranchScopeInput = {
  role: Role
  userBranchId: string | null | undefined
  /** จาก ?branchId= สำหรับ HR/Admin — ค่า `all` หรือไม่ส่ง = ทุกสาขา */
  filterBranchId?: string | null
}

/** สาขาที่ใช้กรองข้อมูล — undefined = ทุกสาขา (เฉพาะ HR/Admin) */
export function resolveFilterBranchId(scope: BranchScopeInput): string | undefined {
  if (scope.role === 'EMPLOYEE' || scope.role === 'LAWYER') {
    return scope.userBranchId ?? undefined
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
