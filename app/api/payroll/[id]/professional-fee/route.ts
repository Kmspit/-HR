import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { canApprovePayroll } from '@/lib/access-control'
import { buildBranchScope, branchUserWhere } from '@/lib/branch-scope'
import { computePayrollTotals } from '@/lib/payroll-totals'
import { computeFlatWithholdingTax } from '@/lib/payroll-tax'
import { createAuditLog } from '@/lib/notifications'
import { ensurePayrollPayslipColumns } from '@/lib/ensure-payroll-payslip-columns'
import { ensurePayrollFieldsBatch2 } from '@/lib/ensure-payroll-fields-batch-2'
import { ensurePayrollFieldsBatch3 } from '@/lib/ensure-payroll-fields-batch-3'

function requestIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}

type RelatedPersonInput = { name?: string; role?: string }

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await ensurePayrollPayslipColumns()
    await ensurePayrollFieldsBatch2()
    await ensurePayrollFieldsBatch3()

    const { id } = await params
    const payroll = await prisma.payroll.findUnique({ where: { id }, select: { id: true, userId: true, deletedAt: true } })
    if (!payroll || payroll.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isHR = canApprovePayroll(session.user.role)
    if (!isHR && payroll.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const payments = await prisma.professionalFeePayment.findMany({
      where: { payrollId: id },
      include: { relatedPersons: true },
      orderBy: { paidAt: 'asc' },
    })
    return NextResponse.json({ payments })
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.id || !canApprovePayroll(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    await ensurePayrollPayslipColumns()
    await ensurePayrollFieldsBatch2()
    await ensurePayrollFieldsBatch3()

    const { id } = await params
    const body = await req.json() as {
      hiringCompany?: string
      jobType?: string
      amount?: number
      paidAt?: string
      relatedPersons?: RelatedPersonInput[]
    }

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
        { error: 'เพิ่มรายการค่าวิชาชีพได้เฉพาะ payroll สถานะร่าง (DRAFT) เท่านั้น' },
        { status: 400 },
      )
    }

    // ยืนยัน 2026-09: บริษัทผู้ว่าจ้าง/ประเภทงาน/จำนวนเงิน/วันที่ + รายชื่อ
    // บุคคลที่เกี่ยวข้องอย่างน้อย 1 คน (พร้อมบทบาท) เป็น required ทุกช่อง —
    // ไม่มี field ไหนเป็น optional text อิสระเหมือนที่ร่างไว้รอบแรก (note)
    const hiringCompany = body.hiringCompany?.trim()
    const jobType = body.jobType?.trim()
    const amount = body.amount
    const paidAtRaw = body.paidAt
    const relatedPersons = (body.relatedPersons ?? []).filter(
      (p): p is Required<RelatedPersonInput> => !!p.name?.trim() && !!p.role?.trim(),
    )

    if (!hiringCompany) return NextResponse.json({ error: 'กรุณาระบุบริษัทผู้ว่าจ้าง' }, { status: 400 })
    if (!jobType) return NextResponse.json({ error: 'กรุณาระบุประเภทงาน' }, { status: 400 })
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'จำนวนเงินต้องเป็นตัวเลขมากกว่า 0' }, { status: 400 })
    }
    const paidAt = paidAtRaw ? new Date(paidAtRaw) : null
    if (!paidAt || Number.isNaN(paidAt.getTime())) {
      return NextResponse.json({ error: 'วันที่จ่ายไม่ถูกต้อง' }, { status: 400 })
    }
    if (relatedPersons.length === 0) {
      return NextResponse.json(
        { error: 'กรุณาระบุรายชื่อบุคคลที่เกี่ยวข้องอย่างน้อย 1 คน (พร้อมบทบาท เช่น ผู้กู้/ผู้ค้ำประกัน)' },
        { status: 400 },
      )
    }

    const taxWithheld = computeFlatWithholdingTax(amount)

    const created = await prisma.$transaction(async (tx) => {
      const payment = await tx.professionalFeePayment.create({
        data: {
          payrollId: id,
          hiringCompany,
          jobType,
          amount,
          paidAt,
          taxWithheld,
          relatedPersons: {
            create: relatedPersons.map((p) => ({ name: p.name.trim(), role: p.role.trim() })),
          },
        },
        include: { relatedPersons: true },
      })

      // Re-aggregate จากทุกรายการของ payroll นี้ (ไม่ใช่แค่ += รายการใหม่)
      // เพื่อกันพลาดถ้ามีการลบ/แก้รายการอื่นพร้อมกัน — แล้ว recompute netSalary
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

      return payment
    })

    await createAuditLog({
      actorId: session.user.id,
      targetId: payroll.userId,
      targetType: 'Payroll',
      action: 'CREATE',
      after: { professionalFeePaymentId: created.id, hiringCompany, jobType, amount, taxWithheld },
      ip: requestIp(req),
      userAgent: req.headers.get('user-agent') ?? undefined,
    })

    return NextResponse.json({ payment: created })
  } catch (err) {
    return apiError(err)
  }
}
