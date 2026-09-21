import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { canApprovePayroll } from '@/lib/access-control'
import { buildBranchScope, branchUserWhere } from '@/lib/branch-scope'
import { computePayrollTotals } from '@/lib/payroll-totals'
import { createAuditLog } from '@/lib/notifications'
import { ensurePayrollPayslipColumns } from '@/lib/ensure-payroll-payslip-columns'
import { ensurePayrollFieldsBatch2 } from '@/lib/ensure-payroll-fields-batch-2'
import { ensurePayrollFieldsBatch3 } from '@/lib/ensure-payroll-fields-batch-3'

function requestIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.id || !canApprovePayroll(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    await ensurePayrollPayslipColumns()
    await ensurePayrollFieldsBatch2()
    await ensurePayrollFieldsBatch3()

    const { id, paymentId } = await params

    const payroll = await prisma.payroll.findUnique({
      where: { id },
      select: { id: true, userId: true, deletedAt: true, status: true },
    })
    if (!payroll || payroll.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const scope = buildBranchScope(session.user, {})
    const targetInScope = await prisma.user.findFirst({
      where: branchUserWhere(scope, { id: payroll.userId }),
      select: { id: true },
    })
    if (!targetInScope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (payroll.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'ลบรายการค่าวิชาชีพได้เฉพาะ payroll สถานะร่าง (DRAFT) เท่านั้น' },
        { status: 400 },
      )
    }

    const payment = await prisma.professionalFeePayment.findUnique({ where: { id: paymentId } })
    if (!payment || payment.payrollId !== id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    await prisma.$transaction(async (tx) => {
      // ProfessionalFeeRelatedPerson มี onDelete: Cascade อยู่แล้วในสคีมา —
      // ลบ payment แล้วลูกหายตามอัตโนมัติ ไม่ต้องลบเองแยก
      await tx.professionalFeePayment.delete({ where: { id: paymentId } })

      const agg = await tx.professionalFeePayment.aggregate({
        where: { payrollId: id },
        _sum: { amount: true, taxWithheld: true },
      })
      const professionalFee = agg._sum.amount ?? 0
      const professionalFeeTax = agg._sum.taxWithheld ?? 0

      const current = await tx.payroll.findUnique({
        where: { id },
        include: { user: { select: { socialSecurity: true } } },
      })
      if (!current) throw new Error('payroll disappeared mid-transaction')

      const totals = computePayrollTotals({
        taxSsBaseSalary: current.baseSalary,
        payoutBaseSalary: current.baseSalary,
        positionAllowance: current.positionAllowance,
        diligenceAllowance: current.diligenceAllowance,
        backPay: current.backPay,
        commission: current.commission,
        professionalFee,
        professionalFeeTax,
        studentLoanDeduction: current.studentLoanDeduction,
        securityDepositDeduction: current.securityDepositDeduction,
        lateDeduction: current.lateDeduction,
        absentDeduction: current.absentDeduction,
        unpaidLeaveDeduction: current.unpaidLeave,
        earlyLeaveDeduction: current.earlyLeaveDeduction,
        overtimePay: current.overtimePay,
        bonus: current.bonus,
        taxScheme: current.taxScheme,
        socialSecurityEnabled: current.user.socialSecurity,
      })

      await tx.payroll.update({
        where: { id },
        data: {
          professionalFee,
          professionalFeeTax,
          socialSecurity: totals.socialSecurity,
          taxDeduction: totals.taxDeduction,
          taxDetail: totals.taxDetail,
          netSalary: totals.netSalary,
        },
      })
    })

    await createAuditLog({
      actorId: session.user.id,
      targetId: payroll.userId,
      targetType: 'Payroll',
      action: 'DELETE',
      before: { professionalFeePaymentId: paymentId, amount: payment.amount, hiringCompany: payment.hiringCompany },
      ip: requestIp(req),
      userAgent: req.headers.get('user-agent') ?? undefined,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
