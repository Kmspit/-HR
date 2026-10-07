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
  payType: true,
  daysWorked: true,
  dailyRateUsed: true,
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
  // 2026-10 feat/payslip-all-items — รายการครบทุกแถว (lib/payslip-line-items.ts)
  positionAllowance: true,
  diligenceAllowance: true,
  professionalFee: true,
  commission: true,
  overtimePay: true,
  bonus: true,
  backPay: true,
  otherAddition: true,
  taxScheme: true,
  taxDetail: true,
  professionalFeeTax: true,
  securityDepositDeduction: true,
  securityDepositInstallmentNo: true,
  earlyLeaveDeduction: true,
  otherDeduction: true,
  studentLoanDeduction: true,
} as const

type PayslipPayrollRow = {
  id: string
  month: number
  year: number
  baseSalary: number
  payType: string | null
  daysWorked: number | null
  dailyRateUsed: number | null
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
  positionAllowance: number
  diligenceAllowance: number
  professionalFee: number
  commission: number
  overtimePay: number
  bonus: number
  backPay: number
  otherAddition: number
  taxScheme: string | null
  taxDetail: string | null
  professionalFeeTax: number
  securityDepositDeduction: number
  securityDepositInstallmentNo: number | null
  earlyLeaveDeduction: number
  otherDeduction: number
  studentLoanDeduction: number
}

function mapPayrolls(payrolls: PayslipPayrollRow[], securityDepositTotalInstallments: number | null) {
  return payrolls.map((p) => ({
    id: p.id,
    month: p.month,
    year: p.year,
    baseSalary: p.baseSalary,
    payType: p.payType,
    daysWorked: p.daysWorked,
    dailyRateUsed: p.dailyRateUsed,
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
    positionAllowance: p.positionAllowance,
    diligenceAllowance: p.diligenceAllowance,
    professionalFee: p.professionalFee,
    commission: p.commission,
    overtimePay: p.overtimePay,
    bonus: p.bonus,
    backPay: p.backPay,
    otherAddition: p.otherAddition,
    taxScheme: p.taxScheme,
    taxDetail: p.taxDetail,
    professionalFeeTax: p.professionalFeeTax,
    securityDepositDeduction: p.securityDepositDeduction,
    securityDepositInstallmentNo: p.securityDepositInstallmentNo,
    securityDepositTotalInstallments: p.securityDepositDeduction > 0 ? securityDepositTotalInstallments : null,
    earlyLeaveDeduction: p.earlyLeaveDeduction,
    otherDeduction: p.otherDeduction,
    studentLoanDeduction: p.studentLoanDeduction,
  }))
}

export default async function PayslipPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/')

  try {
    await ensurePayrollPayslipColumns()

    const payrolls = await prisma.payroll.findMany({
      where: { userId: session.user.id, status: { in: ['APPROVED', 'SENT'] }, deletedAt: null },
      select: PAYSLIP_PAYROLL_SELECT,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: 36,
    })

    // totalInstallments ไม่ได้ snapshot ไว้ที่ Payroll — ดึงจากแผนของ user เดียวกับ
    // app/api/payslip/[id]/pdf/route.ts เพื่อให้ "งวด n/total" ตรงกับ PDF
    const securityDepositPlan = payrolls.some((p) => p.securityDepositDeduction > 0)
      ? await prisma.securityDepositPlan.findUnique({ where: { userId: session.user.id }, select: { totalInstallments: true } })
      : null

    return <PayslipClient payrolls={mapPayrolls(payrolls, securityDepositPlan?.totalInstallments ?? null)} />
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string; meta?: unknown }
    console.error('[payslip PAGE ERROR]', err?.message, err?.code, JSON.stringify(err?.meta))
    return <PayslipClient payrolls={[]} />
  }
}
