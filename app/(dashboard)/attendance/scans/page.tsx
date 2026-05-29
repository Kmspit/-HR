import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AttendanceScansClient from './AttendanceScansClient'
import BranchFilterBar from '@/components/dashboard/BranchFilterBar'
import { buildBranchScope, branchUserWhere, parseBranchQueryParam } from '@/lib/branch-scope'
import { Suspense } from 'react'

const TEAM_ROLES = ['EMPLOYEE', 'MANAGER_HR', 'LAWYER'] as const

export default async function AttendanceScansPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string; userId?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/')

  if (!['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
    redirect('/attendance')
  }

  const sp = await searchParams
  const branchParam = parseBranchQueryParam(sp.branchId)
  const scope = buildBranchScope(session.user, { branchId: branchParam })

  const employees = await prisma.user.findMany({
    where: branchUserWhere(scope, { status: 'ACTIVE', role: { in: [...TEAM_ROLES] } }),
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
