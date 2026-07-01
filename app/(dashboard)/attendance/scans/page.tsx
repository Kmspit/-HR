import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AttendanceScansClient from './AttendanceScansClient'
import BranchFilterBar from '@/components/dashboard/BranchFilterBar'
import { buildBranchScope, branchUserWhere, parseBranchQueryParam } from '@/lib/branch-scope'
import { canAccessPage } from '@/lib/page-access'
import { ATTENDANCE_TEAM_ROLES } from '@/lib/attendance-team-users'
import { Suspense } from 'react'

export default async function AttendanceScansPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string; userId?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/')

  if (!canAccessPage(session.user.role, '/attendance/scans')) {
    redirect('/attendance')
  }

  const sp = await searchParams
  const branchParam = parseBranchQueryParam(sp.branchId)
  const scope = buildBranchScope(session.user, { branchId: branchParam })

  const employees = await prisma.user.findMany({
    where: branchUserWhere(scope, { status: 'ACTIVE', role: { in: ATTENDANCE_TEAM_ROLES } }),
    select: { id: true, name: true, employeeId: true },
    orderBy: { name: 'asc' },
  })

  const defaultUserId =
    sp.userId && employees.some((e) => e.id === sp.userId) ? sp.userId : ''

  return (
    <div className="flex flex-col">
      <Suspense fallback={null}>
        <BranchFilterBar role={session.user.role} filterBranchId={branchParam} />
      </Suspense>
      <AttendanceScansClient employees={employees} defaultUserId={defaultUserId} />
    </div>
  )
}
