import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import MonthlyAttendanceClient from './MonthlyAttendanceClient'
import BranchFilterBar from '@/components/dashboard/BranchFilterBar'
import { buildBranchScope, parseBranchQueryParam } from '@/lib/branch-scope'
import {
  ALL_EMPLOYEES_USER_ID,
  formatTeamUserOptionLabel,
  listAttendanceTeamUsers,
} from '@/lib/attendance-team-users'
import { Suspense } from 'react'

export default async function MonthlyAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string; userId?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/')

  const sp = await searchParams
  const branchParam = parseBranchQueryParam(sp.branchId)
  const scope = buildBranchScope(session.user, { branchId: branchParam })
  const now = new Date()
  const canPickEmployee = ['MANAGER_HR', 'ADMIN'].includes(session.user.role)

  let employees: {
    id: string
    name: string
    employeeId: string | null
    status: string
    department: string | null
    label: string
  }[] = []

  if (canPickEmployee) {
    const team = await listAttendanceTeamUsers(scope)
    employees = team.map((e) => ({
      id: e.id,
      name: e.name,
      employeeId: e.employeeId,
      status: e.status,
      department: e.department,
      label: formatTeamUserOptionLabel(e),
    }))
  }

  const validIds = new Set([ALL_EMPLOYEES_USER_ID, ...employees.map((e) => e.id)])

  let defaultUserId = session.user.id
  if (canPickEmployee) {
    if (sp.userId && validIds.has(sp.userId)) {
      defaultUserId = sp.userId
    } else {
      defaultUserId = ALL_EMPLOYEES_USER_ID
    }
  }

  return (
    <div className="flex flex-col">
      {canPickEmployee && (
        <Suspense fallback={null}>
          <BranchFilterBar role={session.user.role} filterBranchId={branchParam} />
        </Suspense>
      )}
      <MonthlyAttendanceClient
        role={session.user.role}
        defaultUserId={defaultUserId}
        selfUserId={session.user.id}
        defaultMonth={now.getMonth() + 1}
        defaultYear={now.getFullYear()}
        initialEmployees={employees}
        canPickEmployee={canPickEmployee}
      />
    </div>
  )
}
