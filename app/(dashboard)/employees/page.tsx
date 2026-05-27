import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Topbar from '@/components/dashboard/Topbar'
import EmployeeManager from '@/components/dashboard/EmployeeManager'
import { canApproveAccounts } from '@/lib/permissions'
import BranchFilterBar from '@/components/dashboard/BranchFilterBar'
import { buildBranchScope, branchUserWhere, parseBranchQueryParam } from '@/lib/branch-scope'
import { Suspense } from 'react'

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; branchId?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/')
  if (!canApproveAccounts(session.user.role)) redirect('/dashboard')

  const sp = await searchParams
  const { tab } = sp
  const branchParam = parseBranchQueryParam(sp.branchId)
  const scope = buildBranchScope(session.user, { branchId: branchParam })
  const defaultTab = session.user.role === 'ADMIN' ? 'pending' : (tab ?? 'all')

  const users = await prisma.user.findMany({
    where: branchUserWhere(scope, {}),
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true, name: true, email: true, employeeId: true, role: true,
      status: true, department: true, position: true, phone: true,
      baseSalary: true, socialSecurity: true, startDate: true, lineId: true,
      isCoworker: true, createdAt: true,
      branch: { select: { name: true, code: true } },
    },
  })

  const user = { name: session.user.name ?? '', email: session.user.email ?? '', role: session.user.role, department: session.user.department }

  const stats = {
    total:   users.filter(u => u.status === 'ACTIVE').length,
    pending: users.filter(u => u.status === 'PENDING').length,
    active:  users.filter(u => u.status === 'ACTIVE').length,
    disabled: users.filter(u => u.status === 'DISABLED').length,
  }

  return (
    <div className="flex flex-col">
      <Topbar
        title="จัดการพนักงาน"
        subtitle={`พนักงานทั้งหมด ${stats.active} คน · รออนุมัติ ${stats.pending} คน`}
      />
      <Suspense fallback={null}>
        <BranchFilterBar role={session.user.role} filterBranchId={branchParam} />
      </Suspense>
      <EmployeeManager users={JSON.parse(JSON.stringify(users))} stats={stats} initialTab={defaultTab} />
    </div>
  )
}
