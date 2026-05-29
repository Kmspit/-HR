import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import MonthlyAttendanceClient from './MonthlyAttendanceClient'
import BranchFilterBar from '@/components/dashboard/BranchFilterBar'
import { buildBranchScope, branchUserWhere, parseBranchQueryParam } from '@/lib/branch-scope'
import { Suspense } from 'react'

const TEAM_ROLES = ['EMPLOYEE', 'MANAGER_HR', 'LAWYER'] as const

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

  let employees: { id: string; name: string; employeeId: string | null }[] = []
  if (canPickEmployee) {
    employees = await prisma.user.findMany({
      where: branchUserWhere(scope, { status: 'ACTIVE', role: { in: [...TEAM_ROLES] } }),
      select: { id: true, name: true, employeeId: true },
      orderBy: { name: 'asc' },
    })
  }

  const defaultUserId =
    sp.userId && canPickEmployee && employees.some((e) => e.id === sp.userId)
      ? sp.userId
      : session.user.id

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
        employees={employees}
        canPickEmployee={canPickEmployee}
      />
    </div>
  )
}
