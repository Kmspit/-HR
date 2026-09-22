import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { generateSalarySlipPdf } from '@/lib/payroll-pdf'
import { HR_ROLES } from '@/lib/access-control'
import { buildBranchScope, branchUserWhere } from '@/lib/branch-scope'
import { getCachedCompanySettings } from '@/lib/company-settings-cache'
import { ensurePayrollPayslipColumns } from '@/lib/ensure-payroll-payslip-columns'
import { ensurePayrollFieldsBatch3 } from '@/lib/ensure-payroll-fields-batch-3'
import { computePayrollYtd } from '@/lib/payroll-ytd'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await ensurePayrollPayslipColumns()
    await ensurePayrollFieldsBatch3()

    const { id } = await params

    const payroll = await prisma.payroll.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            name: true,
            employeeId: true,
            department: true,
            position: true,
            branchId: true,
          },
        },
      },
    })

    if (!payroll || payroll.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (payroll.status !== 'APPROVED') {
      return NextResponse.json({ error: 'ต้องอนุมัติ payroll ก่อนดาวน์โหลดสลิป' }, { status: 403 })
    }

    const isHr = (HR_ROLES as readonly string[]).includes(session.user.role)
    if (payroll.userId !== session.user.id && !isHr) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (isHr && payroll.userId !== session.user.id) {
      const scope = buildBranchScope(session.user, {})
      const inScope = await prisma.user.findFirst({
        where: branchUserWhere(scope, { id: payroll.userId }),
        select: { id: true },
      })
      if (!inScope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const settings = await getCachedCompanySettings()
    const companyName = settings?.companyName ?? 'บริษัท'

    const ytd = await computePayrollYtd(payroll.userId, payroll.year, payroll.month)
    // totalInstallments ไม่ได้ snapshot ไว้ที่ Payroll (มีแค่ installmentNo ของ
    // เดือนนี้) ต้องดึงจากแผนของ user โดยตรง — ไม่มีแผน (เช่นผ่อนครบ/ถูกลบแผน
    // ไปแล้ว) ก็ยังโชว์ยอดเงินประกันได้ปกติ แค่ไม่มี "(งวด n/total)" ต่อท้าย
    const securityDepositPlan = payroll.securityDepositDeduction > 0
      ? await prisma.securityDepositPlan.findUnique({ where: { userId: payroll.userId }, select: { totalInstallments: true } })
      : null

    const pdfBuffer = await generateSalarySlipPdf({
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
      positionAllowance: payroll.positionAllowance,
      diligenceAllowance: payroll.diligenceAllowance,
      commission: payroll.commission,
      overtimePay: payroll.overtimePay,
      bonus: payroll.bonus,
      studentLoanDeduction: payroll.studentLoanDeduction,
      securityDepositDeduction: payroll.securityDepositDeduction,
      securityDepositInstallmentNo: payroll.securityDepositInstallmentNo,
      securityDepositTotalInstallments: securityDepositPlan?.totalInstallments ?? null,
      netSalary: payroll.netSalary,
      lateDays: payroll.lateDays,
      absentDays: payroll.absentDays,
      lateMinutes: payroll.lateBillableMinutes ?? payroll.lateMinutes,
      payType: payroll.payType,
      daysWorked: payroll.daysWorked,
      dailyRateUsed: payroll.dailyRateUsed,
      ytd,
    })

    const filename = `slip_${payroll.year}_${String(payroll.month).padStart(2, '0')}_${payroll.user.employeeId ?? payroll.userId.slice(0, 6)}.pdf`

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.length),
      },
    })
  } catch (err) {
    return apiError(err)
  }
}
