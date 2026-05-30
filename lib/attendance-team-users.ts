import { prisma } from '@/lib/prisma'
import type { BranchScopeInput } from '@/lib/branch-scope'
import { branchUserWhere } from '@/lib/branch-scope'
import type { Role, UserStatus } from '@prisma/client'

/** บทบาทที่แสดงในรายงานลงเวลา */
export const ATTENDANCE_TEAM_ROLES: Role[] = ['EMPLOYEE', 'MANAGER_HR', 'LAWYER']

/** รวมผู้สมัครใหม่ (รออนุมัติ) + พนักงานที่ใช้งานแล้ว */
export const ATTENDANCE_TEAM_STATUSES: UserStatus[] = ['ACTIVE', 'PENDING']

export const ALL_EMPLOYEES_USER_ID = 'all'

export type AttendanceTeamUser = {
  id: string
  name: string
  employeeId: string | null
  status: UserStatus
  department: string | null
}

export async function listAttendanceTeamUsers(
  scope: BranchScopeInput,
): Promise<AttendanceTeamUser[]> {
  return prisma.user.findMany({
    where: branchUserWhere(scope, {
      status: { in: ATTENDANCE_TEAM_STATUSES },
      role: { in: ATTENDANCE_TEAM_ROLES },
    }),
    select: {
      id: true,
      name: true,
      employeeId: true,
      status: true,
      department: true,
    },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
  })
}

export function formatTeamUserOptionLabel(u: AttendanceTeamUser): string {
  const code = u.employeeId ? ` (${u.employeeId})` : ''
  const pending = u.status === 'PENDING' ? ' — รออนุมัติ' : ''
  return `${u.name}${code}${pending}`
}
