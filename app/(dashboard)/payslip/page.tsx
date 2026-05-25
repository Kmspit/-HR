import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import PayslipClient from './PayslipClient'

export default async function PayslipPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/')

  const payrolls = await prisma.payroll.findMany({
    where: { userId: session.user.id, status: { in: ['APPROVED', 'SENT'] } },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    take: 24,
  })

  return (
    <PayslipClient
      payrolls={payrolls.map((p) => ({
        id: p.id,
        month: p.month,
        year: p.year,
        baseSalary: p.baseSalary,
        lateDeduction: p.lateDeduction,
        absentDeduction: p.absentDeduction,
        unpaidLeave: p.unpaidLeave,
        ssDeduction: p.socialSecurity,
        netSalary: p.netSalary,
        lateDays: p.lateDays,
        absentDays: p.absentDays,
        status: p.status,
      }))}
    />
  )
}
