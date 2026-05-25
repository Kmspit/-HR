import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import PayrollClient from './PayrollClient'

export default async function PayrollPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/')
  if (!['MANAGER_HR', 'ADMIN'].includes(session.user.role)) redirect('/unauthorized')

  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const payrolls = await prisma.payroll.findMany({
    where: { month, year },
    include: {
      user: { select: { name: true, employeeId: true, department: true, position: true, socialSecurity: true } },
    },
    orderBy: { user: { name: 'asc' } },
  })

  return (
    <PayrollClient
      month={month}
      year={year}
      payrolls={payrolls.map((p) => ({
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
        status: p.status,
      }))}
    />
  )
}
