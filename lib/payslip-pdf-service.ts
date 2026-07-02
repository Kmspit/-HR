import { prisma } from '@/lib/prisma'
import { generateSalarySlipPdf } from '@/lib/payroll-pdf'
import { parseTaxDetail } from '@/lib/payroll-tax'

const DEFAULT_COMPANY = 'บริษัท เค เอ็ม เซอร์วิสพลัส จำกัด'

export type PayrollSlipRecord = Awaited<ReturnType<typeof loadPayrollForSlip>>

export async function loadPayrollForSlip(payrollId: string) {
  return prisma.payroll.findUnique({
    where: { id: payrollId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          employeeId: true,
          department: true,
          position: true,
          branchId: true,
          nationalId: true,
          lineUserId: true,
        },
      },
    },
  })
}

export async function buildPayrollSlipPdfBuffer(payroll: NonNullable<PayrollSlipRecord>): Promise<{
  buffer: Buffer
  filename: string
}> {
  const settings = await prisma.companySettings.findUnique({ where: { id: 'singleton' } })
  const companyName = settings?.companyName?.trim() || DEFAULT_COMPANY
  const taxDetail = parseTaxDetail(payroll.taxDetail ?? null)

  const buffer = await generateSalarySlipPdf({
    companyName,
    employeeName: payroll.user.name,
    employeeId: payroll.user.employeeId ?? null,
    department: payroll.user.department ?? null,
    position: payroll.user.position ?? null,
    month: payroll.month,
    year: payroll.year,
    baseSalary: payroll.baseSalary,
    lateDeduction: payroll.lateDeduction,
    absentDeduction: payroll.absentDeduction,
    unpaidLeave: payroll.unpaidLeave,
    socialSecurity: payroll.socialSecurity,
    taxDeduction: payroll.taxDeduction ?? 0,
    otherDeduction: payroll.otherDeduction,
    otherAddition: payroll.otherAddition,
    netSalary: payroll.netSalary,
    lateDays: payroll.lateDays,
    absentDays: payroll.absentDays,
    lateMinutes: payroll.lateBillableMinutes ?? payroll.lateMinutes,
    taxDetail: taxDetail
      ? {
          annualGross: taxDetail.annualGross,
          taxableIncome: taxDetail.taxableIncome,
          annualTax: taxDetail.annualTax,
          monthlyWithholding: taxDetail.monthlyWithholding,
        }
      : null,
  })

  const filename = `slip_${payroll.year}_${String(payroll.month).padStart(2, '0')}_${payroll.user.employeeId ?? payroll.userId.slice(0, 6)}.pdf`
  return { buffer, filename }
}
