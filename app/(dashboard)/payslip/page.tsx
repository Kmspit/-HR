import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import PayslipClient from './PayslipClient'
import { ensurePayrollPayslipColumns } from '@/lib/ensure-payroll-payslip-columns'

const PAYSLIP_PAYROLL_SELECT = {
  id: true,
  month: true,
  year: true,
  baseSalary: true,
  lateDeduction: true,
  absentDeduction: true,
  unpaidLeave: true,
  socialSecurity: true,
  taxDeduction: true,
  netSalary: true,
  lateDays: true,
  absentDays: true,
  lateMinutes: true,
  lateBillableMinutes: true,
  lateDeductionDetail: true,
  status: true,
} as const

type PayslipPayrollRow = {
  id: string
  month: number
  year: number
  baseSalary: number
  lateDeduction: number
  absentDeduction: number
  unpaidLeave: number
  socialSecurity: number
  taxDeduction: number
  netSalary: number
  lateDays: number
  absentDays: number
  lateMinutes: number
  lateBillableMinutes: number
  lateDeductionDetail: string | null
  status: string
}

function mapPayrolls(payrolls: PayslipPayrollRow[]) {
  return payrolls.map((p) => ({
    id: p.id,
    month: p.month,
    year: p.year,
    baseSalary: p.baseSalary,
    lateDeduction: p.lateDeduction,
    absentDeduction: p.absentDeduction,
    unpaidLeave: p.unpaidLeave,
    ssDeduction: p.socialSecurity,
    taxDeduction: p.taxDeduction ?? 0,
    netSalary: p.netSalary,
    lateDays: p.lateDays,
    absentDays: p.absentDays,
    lateMinutes: p.lateBillableMinutes ?? p.lateMinutes,
    lateBillableMinutes: p.lateBillableMinutes ?? p.lateMinutes,
    lateDeductionDetail: p.lateDeductionDetail,
    status: p.status,
  }))
}

export default async function PayslipPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/')

  try {
    await ensurePayrollPayslipColumns()

    const payrolls = await prisma.payroll.findMany({
      where: { userId: session.user.id, status: { in: ['APPROVED', 'SENT'] } },
      select: PAYSLIP_PAYROLL_SELECT,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: 36,
    })

    return <PayslipClient payrolls={mapPayrolls(payrolls)} />
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string; meta?: unknown }
    console.error('[payslip PAGE ERROR]', err?.message, err?.code, JSON.stringify(err?.meta))
    return <PayslipClient payrolls={[]} />
  }
}
