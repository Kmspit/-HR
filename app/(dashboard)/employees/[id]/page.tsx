import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'
import type { Role } from '@prisma/client'
import Topbar from '@/components/dashboard/Topbar'
import EmployeeEditClient from './EmployeeEditClient'
import { canManageUserProfile } from '@/lib/role-assignment'
import { canViewEmployeeTimeline } from '@/lib/employee-timeline/access'
import { HR_ADMIN } from '@/lib/module-gates'
import { ensurePayrollFieldsBatch2 } from '@/lib/ensure-payroll-fields-batch-2'
import { ensurePayrollFieldsBatch3 } from '@/lib/ensure-payroll-fields-batch-3'

export default async function EmployeeEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) redirect('/')

  const role = session.user.role as Role
  const allowed = await canViewEmployeeTimeline(
    prisma,
    session.user.id,
    role,
    session.user.branchId,
    id,
  )
  if (!allowed) redirect('/unauthorized')

  if (!canManageUserProfile(role)) {
    redirect(`/employees/${id}/timeline`)
  }

  await ensurePayrollFieldsBatch2()
  await ensurePayrollFieldsBatch3()

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, email: true, employeeId: true, role: true, status: true,
      employeeType: true,
      department: true, position: true, jobLevel: true, socialSecurityNumber: true,
      baseSalary: true, payType: true, taxScheme: true, dailyRate: true, socialSecurity: true,
      positionAllowance: true, diligenceAllowanceDefault: true, studentLoanDeduction: true,
      isCoworker: true, startDate: true, phone: true, lineId: true,
      lineUserId: true, lineDisplayName: true, branchId: true,
      prefix: true, nickname: true, birthDate: true, address: true, addressIdCard: true,
    },
  })

  if (!user) notFound()

  const warningCount = await prisma.warning.count({ where: { userId: id } })

  // backlog 4.3 — canEditSalary only hid the salary INPUT for MANAGER; the
  // raw value was still shipped to the client in this page's props (visible
  // via page source / React DevTools). Filtered at the source here instead.
  const canViewSalary = HR_ADMIN.includes(role)

  const securityDepositPlan = canViewSalary
    ? await prisma.securityDepositPlan.findUnique({ where: { userId: id } })
    : null

  return (
    <div className="flex flex-col min-h-0">
      <Topbar title="แก้ไขข้อมูลพนักงาน" subtitle={user.name} />
      <EmployeeEditClient
      currentUserId={session.user.id}
      canEditSalary={canViewSalary}
      canViewSensitive={HR_ADMIN.includes(role)}
      canManageEmploymentHistory={HR_ADMIN.includes(role)}
      securityDepositPlan={
        securityDepositPlan
          ? {
              ...securityDepositPlan,
              createdAt: securityDepositPlan.createdAt.toISOString(),
              updatedAt: securityDepositPlan.updatedAt.toISOString(),
            }
          : null
      }
      employee={{
        ...user,
        baseSalary: canViewSalary ? (user.baseSalary ?? 0) : 0,
        // Same reasoning as baseSalary just above — a sensitive HR-only
        // field, filtered at the source rather than just hidden by the UI.
        socialSecurityNumber: canViewSalary ? user.socialSecurityNumber : null,
        // payType itself isn't a money figure (same treatment as
        // employeeType below — not filtered), but dailyRate is exactly as
        // sensitive as baseSalary and gets the same source-level filter.
        dailyRate: canViewSalary ? user.dailyRate : null,
        // Payroll fields batch 2 (2026-09) — same source-level filter as
        // dailyRate/baseSalary above (HR_ADMIN-only financial fields).
        positionAllowance: canViewSalary ? user.positionAllowance : null,
        diligenceAllowanceDefault: canViewSalary ? user.diligenceAllowanceDefault : null,
        studentLoanDeduction: canViewSalary ? user.studentLoanDeduction : null,
        startDate: user.startDate?.toISOString() ?? null,
        birthDate: user.birthDate?.toISOString() ?? null,
        employeeType: user.employeeType ?? 'permanent_employee',
        warningCount,
      }}
    />
    </div>
  )
}
