import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import PayrollClient from './PayrollClient'
import BranchFilterBar from '@/components/dashboard/BranchFilterBar'
import { buildBranchScope, branchUserWhere, branchNestedUserWhere, parseBranchQueryParam } from '@/lib/branch-scope'
import { canAccessPage } from '@/lib/page-access'
import { Suspense } from 'react'

const PAYROLL_ROLES = ['EMPLOYEE', 'MANAGER_HR', 'LAWYER'] as const

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/')
  if (!canAccessPage(session.user.role, '/payroll')) redirect('/unauthorized')

  const sp = await searchParams
  const branchParam = parseBranchQueryParam(sp.branchId)
  const scope = buildBranchScope(session.user, { branchId: branchParam })
  const employeeWhere = branchUserWhere(scope, { status: 'ACTIVE', role: { in: [...PAYROLL_ROLES] } })
  const nestedUser = branchNestedUserWhere(scope)

  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const [employees, payrollRecords] = await Promise.all([
    prisma.user.findMany({
      where: employeeWhere,
      select: {
        id: true,
        name: true,
        employeeId: true,
        department: true,
        position: true,
        socialSecurity: true,
        baseSalary: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.payroll.findMany({
      where: { month, year, ...(nestedUser ? { user: nestedUser } : {}) },
      include: {
        user: { select: { name: true, employeeId: true, department: true, position: true, socialSecurity: true } },
      },
    }),
  ])

  const payrollByUser = new Map(payrollRecords.map((p) => [p.userId, p]))

  const payrolls = employees.map((emp) => {
    const p = payrollByUser.get(emp.id)
    if (p) {
      return {
        id: p.id,
        userId: p.userId,
        name: p.user.name,
        employeeId: p.user.employeeId ?? '',
        department: p.user.department ?? '',
        position: p.user.position ?? '',
        socialSecurity: p.user.socialSecurity,
        baseSalary: p.baseSalary,
        lateDeduction: p.lateDeduction,
        absentDeduction: p.absentDeduction,
        unpaidLeave: p.unpaidLeave,
        ssDeduction: p.socialSecurity,
        netSalary: p.netSalary,
        lateDays: p.lateDays,
        absentDays: p.absentDays,
        lateMinutes: p.lateMinutes ?? 0,
        lateBillableMinutes: p.lateBillableMinutes ?? p.lateMinutes ?? 0,
        lateDeductionDetail: p.lateDeductionDetail,
        status: p.status,
        hasPayroll: true,
        payslipSentAt: p.payslipSentAt?.toISOString() ?? null,
        payslipSentVia: p.payslipSentVia ?? null,
        payslipSentStatus: p.payslipSentStatus ?? null,
        payslipSentError: p.payslipSentError ?? null,
      }
    }
    return {
      id: `pending-${emp.id}`,
      userId: emp.id,
      name: emp.name,
      employeeId: emp.employeeId ?? '',
      department: emp.department ?? '',
      position: emp.position ?? '',
      socialSecurity: emp.socialSecurity,
      baseSalary: emp.baseSalary ?? 0,
      lateDeduction: 0,
      absentDeduction: 0,
      unpaidLeave: 0,
      ssDeduction: 0,
      netSalary: 0,
      lateDays: 0,
      absentDays: 0,
      lateMinutes: 0,
      status: 'PENDING',
      hasPayroll: false,
      payslipSentAt: null,
      payslipSentVia: null,
      payslipSentStatus: null,
      payslipSentError: null,
    }
  })

  return (
    <div className="flex flex-col">
      <Suspense fallback={null}>
        <BranchFilterBar role={session.user.role} filterBranchId={branchParam} />
      </Suspense>
      <PayrollClient
        month={month}
        year={year}
        payrolls={payrolls}
        totalEmployees={employees.length}
        filterBranchId={branchParam}
      />
    </div>
  )
}
