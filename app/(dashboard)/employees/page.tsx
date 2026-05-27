import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Topbar from '@/components/dashboard/Topbar'
import EmployeeManager from '@/components/dashboard/EmployeeManager'
import { canApproveAccounts } from '@/lib/permissions'
import BranchFilterBar from '@/components/dashboard/BranchFilterBar'
import { buildBranchScope, resolveFilterBranchId, parseBranchQueryParam } from '@/lib/branch-scope'
import { employeeListWhere, parseOrgFilterParam } from '@/lib/employee-filters'
import { Suspense } from 'react'

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string
    branchId?: string
    divisionId?: string
    departmentId?: string
    sectionId?: string
  }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/')
  if (!canApproveAccounts(session.user.role)) redirect('/dashboard')

  const sp = await searchParams
  const { tab } = sp
  const branchParam = parseBranchQueryParam(sp.branchId)
  const scope = buildBranchScope(session.user, { branchId: branchParam })
  const filterBranchId = resolveFilterBranchId(scope)
  const orgFilters = {
    divisionId: parseOrgFilterParam(sp.divisionId),
    departmentId: parseOrgFilterParam(sp.departmentId),
    sectionId: parseOrgFilterParam(sp.sectionId),
  }
  const defaultTab = session.user.role === 'ADMIN' ? 'pending' : (tab ?? 'all')

  const branchWhere = filterBranchId ? { branchId: filterBranchId } : {}

  const [users, divisions, departments, sections] = await Promise.all([
    prisma.user.findMany({
      where: employeeListWhere(scope, orgFilters),
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true, name: true, email: true, employeeId: true, role: true,
        status: true, department: true, position: true, phone: true,
        baseSalary: true, socialSecurity: true, startDate: true, lineId: true,
        isCoworker: true, createdAt: true, branchId: true,
        divisionId: true, departmentId: true, sectionId: true,
        branch: { select: { name: true, code: true } },
        division: { select: { name: true, code: true } },
        orgDepartment: { select: { name: true, code: true } },
        section: { select: { name: true, code: true } },
      },
    }),
    prisma.division.findMany({
      where: { ...branchWhere, isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    }),
    prisma.department.findMany({
      where: { ...branchWhere, isActive: true },
      select: { id: true, name: true, code: true, divisionId: true },
      orderBy: { name: 'asc' },
    }),
    prisma.section.findMany({
      where: { ...branchWhere, isActive: true },
      select: { id: true, name: true, code: true, departmentId: true },
      orderBy: { name: 'asc' },
    }),
  ])

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
      <Suspense fallback={<div className="p-5 text-slate-500 text-sm">กำลังโหลด...</div>}>
        <EmployeeManager
          users={JSON.parse(JSON.stringify(users))}
          stats={stats}
          initialTab={defaultTab}
          orgFilterOptions={{
            divisions: JSON.parse(JSON.stringify(divisions)),
            departments: JSON.parse(JSON.stringify(departments)),
            sections: JSON.parse(JSON.stringify(sections)),
          }}
          currentOrgFilters={orgFilters}
        />
      </Suspense>
    </div>
  )
}
