import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Topbar from '@/components/dashboard/Topbar'
import EmployeeManager from '@/components/dashboard/EmployeeManager'
import { canAccessPage } from '@/lib/page-access'
import BranchFilterBar from '@/components/dashboard/BranchFilterBar'
import { buildBranchScope, resolveFilterBranchId, parseBranchQueryParam } from '@/lib/branch-scope'
import { employeeListWhere, parseOrgFilterParam } from '@/lib/employee-filters'
import { HR_ADMIN } from '@/lib/module-gates'
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
  if (!canAccessPage(session.user.role, '/employees')) redirect('/dashboard')

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

  // Phase 1 step 8c — a DISABLED user could mean "administratively
  // suspended" or "formally offboarded" (TERMINATION assignment). Both use
  // the same User.status value (see lib/employment-assignment-validation.ts's
  // header comment on why no separate TERMINATED status was added), so the
  // distinction is derived here from each disabled employee's most recent
  // EmploymentAssignment row rather than a stored flag. `distinct` +
  // `orderBy` gives "latest row per user" in one query instead of N queries.
  const disabledUserIds = users.filter((u) => u.status === 'DISABLED').map((u) => u.id)
  const latestAssignments = disabledUserIds.length
    ? await prisma.employmentAssignment.findMany({
        where: { userId: { in: disabledUserIds } },
        orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
        distinct: ['userId'],
        select: { userId: true, changeType: true },
      })
    : []
  const terminatedUserIds = new Set(
    latestAssignments.filter((a) => a.changeType === 'TERMINATION').map((a) => a.userId),
  )

  const stats = {
    total:      users.length,
    pending:    users.filter(u => u.status === 'PENDING').length,
    active:     users.filter(u => u.status === 'ACTIVE').length,
    disabled:   users.filter(u => u.status === 'DISABLED' && !terminatedUserIds.has(u.id)).length,
    terminated: users.filter(u => u.status === 'DISABLED' && terminatedUserIds.has(u.id)).length,
    rejected:   users.filter(u => u.status === 'REJECTED').length,
  }

  return (
    <div className="flex flex-col">
      <Topbar
        title="จัดการพนักงาน"
        subtitle={`พนักงานทั้งหมด ${stats.total} คน · Active ${stats.active} คน · รออนุมัติ ${stats.pending} คน`}
      />
      <Suspense fallback={null}>
        <BranchFilterBar role={session.user.role} filterBranchId={branchParam} />
      </Suspense>
      <Suspense fallback={<div className="p-5 text-slate-500 text-sm">กำลังโหลด...</div>}>
        <EmployeeManager
          users={JSON.parse(JSON.stringify(
            users.map((u) => ({ ...u, isTerminated: terminatedUserIds.has(u.id) })),
          ))}
          stats={stats}
          initialTab={defaultTab}
          orgFilterOptions={{
            divisions: JSON.parse(JSON.stringify(divisions)),
            departments: JSON.parse(JSON.stringify(departments)),
            sections: JSON.parse(JSON.stringify(sections)),
          }}
          currentOrgFilters={orgFilters}
          canEditSalary={HR_ADMIN.includes(session.user.role)}
        />
      </Suspense>
    </div>
  )
}
