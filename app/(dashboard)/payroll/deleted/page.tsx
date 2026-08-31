import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import { canAccessPage } from '@/lib/page-access'
import { ensurePayrollPayslipColumns } from '@/lib/ensure-payroll-payslip-columns'
import DeletedPayrollList from './DeletedPayrollList'

const MONTH_NAMES = [
  '', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]

export default async function PayrollDeletedPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  if (!canAccessPage(session.user.role, '/payroll/deleted')) redirect('/unauthorized')

  await ensurePayrollPayslipColumns()

  // PAYROLL_DELETE_ROLES are all company-wide roles (SUPER_ADMIN/CEO) — no
  // branch scoping needed, matching debtors/deleted's reasoning.
  const rows = await prisma.payroll
    .findMany({
      where: { deletedAt: { not: null } },
      select: {
        id: true, month: true, year: true, netSalary: true, deletedAt: true,
        user: { select: { name: true, employeeId: true } },
        deletedBy: { select: { name: true } },
      },
      orderBy: { deletedAt: 'desc' },
      take: 200,
    })
    .catch(() => [])

  const items = rows.map((r) => ({
    id: r.id,
    employeeName: r.user.name,
    employeeId: r.user.employeeId,
    month: r.month,
    year: r.year,
    monthLabel: `${MONTH_NAMES[r.month]} ${r.year + 543}`,
    netSalary: r.netSalary,
    deletedAt: r.deletedAt!.toISOString(),
    deletedByName: r.deletedBy?.name ?? null,
  }))

  return (
    <div className="flex flex-col">
      <Topbar
        title="payroll ที่ถูกลบ"
        subtitle="กู้คืน payroll ที่ถูกลบไปแล้วได้ที่นี่ (เฉพาะผู้มีสิทธิ์ลบ payroll)"
      />
      <DeletedPayrollList initialItems={items} />
    </div>
  )
}
