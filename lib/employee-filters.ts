import type { Prisma } from '@prisma/client'
import type { BranchScopeInput } from '@/lib/branch-scope'
import { branchUserWhere } from '@/lib/branch-scope'

export type EmployeeListFilters = {
  divisionId?: string
  departmentId?: string
  sectionId?: string
}

export function employeeListWhere(
  scope: BranchScopeInput,
  filters: EmployeeListFilters,
  extra?: Prisma.UserWhereInput,
): Prisma.UserWhereInput {
  const base = branchUserWhere(scope, { ...extra })
  if (filters.divisionId) base.divisionId = filters.divisionId
  if (filters.departmentId) base.departmentId = filters.departmentId
  if (filters.sectionId) base.sectionId = filters.sectionId
  return base
}

export function parseOrgFilterParam(value: string | string[] | undefined): string | undefined {
  if (!value || Array.isArray(value)) return undefined
  const v = value.trim()
  return v && v !== 'all' ? v : undefined
}
