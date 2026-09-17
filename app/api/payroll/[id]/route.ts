import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { HR_ROLES, canApprovePayroll, PAYROLL_DELETE_ROLES } from '@/lib/access-control'
import { buildBranchScope, branchUserWhere } from '@/lib/branch-scope'
import { ensurePayrollPayslipColumns } from '@/lib/ensure-payroll-payslip-columns'
import { ensurePayrollFieldsBatch2 } from '@/lib/ensure-payroll-fields-batch-2'
import { createAuditLog } from '@/lib/notifications'
import { softDelete } from '@/lib/soft-delete'
import { computePayrollTotals } from '@/lib/payroll-totals'

function requestIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await ensurePayrollPayslipColumns()
    await ensurePayrollFieldsBatch2()

    const { id } = await params
    const isHR = (HR_ROLES as readonly string[]).includes(session.user.role)

    const payroll = await prisma.payroll.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            employeeId: true,
            department: true,
            position: true,
            socialSecurity: true,
            baseSalary: true,
            branchId: true,
          },
        },
      },
    })

    if (!payroll || payroll.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!isHR && payroll.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (isHR) {
      const scope = buildBranchScope(session.user, {})
      const targetInScope = await prisma.user.findFirst({
        where: branchUserWhere(scope, { id: payroll.userId }),
        select: { id: true },
      })
      if (!targetInScope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!isHR && !['APPROVED', 'SENT'].includes(payroll.status)) {
      return NextResponse.json({ error: 'Not available' }, { status: 404 })
    }

    return NextResponse.json({ payroll })
  } catch (err) {
    return apiError(err)
  }
}

export async function PATCH(
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

    const { id } = await params
    const body = await req.json() as {
      status?: string
      note?: string
      backPay?: number
      commission?: number
    }

    const payroll = await prisma.payroll.findUnique({
      where: { id },
      include: { user: { select: { socialSecurity: true } } },
    })
    if (!payroll || payroll.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const scope = buildBranchScope(session.user, {})
    const targetInScope = await prisma.user.findFirst({
      where: branchUserWhere(scope, { id: payroll.userId }),
      select: { id: true },
    })
    if (!targetInScope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const updateData: Record<string, unknown> = {}
    if (body.status) updateData.status = body.status
    if (body.note !== undefined) updateData.note = body.note
    if (body.status === 'APPROVED') {
      updateData.approvedById = session.user.id
      updateData.approvedAt = new Date()
    }

    // ตกเบิก/คอมมิชชั่น (payroll fields batch 2, 2026-09) — HR กรอกมือเท่านั้น
    // แก้ได้เฉพาะแถวที่ยังเป็น DRAFT (ล็อกทันทีที่ approve เหมือน field การเงิน
    // อื่นทั้งหมดในระบบนี้) เพื่อไม่ให้ตัวเลขที่อนุมัติ/จ่ายจริงไปแล้วเปลี่ยนย้อนหลัง
    const editingBackPay = body.backPay !== undefined
    const editingCommission = body.commission !== undefined
    if (editingBackPay || editingCommission) {
      if (payroll.status !== 'DRAFT') {
        return NextResponse.json(
          { error: 'แก้ไขตกเบิก/คอมมิชชั่นได้เฉพาะ payroll สถานะร่าง (DRAFT) เท่านั้น' },
          { status: 400 },
        )
      }
      if (editingBackPay && (typeof body.backPay !== 'number' || body.backPay < 0 || !Number.isFinite(body.backPay))) {
        return NextResponse.json({ error: 'backPay ต้องเป็นตัวเลขไม่ติดลบ' }, { status: 400 })
      }
      if (editingCommission && (typeof body.commission !== 'number' || body.commission < 0 || !Number.isFinite(body.commission))) {
        return NextResponse.json({ error: 'commission ต้องเป็นตัวเลขไม่ติดลบ' }, { status: 400 })
      }

      const newBackPay = editingBackPay ? body.backPay! : payroll.backPay
      const newCommission = editingCommission ? body.commission! : payroll.commission

      // Server คำนวณ SS/ภาษี/netSalary ใหม่เองเสมอ — ไม่เชื่อค่าที่ client ส่งมา
      // เลย ใช้ payroll.baseSalary ที่ snapshot ไว้ตอน generate ทั้งเป็นฐาน SS/
      // ภาษีและฐาน payout (สมมติฐาน: กรณีพนักงานเข้างานกลางเดือน generate ใช้
      // baseSalary เต็มจำนวนคำนวณ SS/ภาษีแต่ payout เป็นค่า prorate — PATCH นี้
      // ไม่ทราบค่าดิบก่อน prorate จึงใช้ค่า snapshot เดียวกันทั้งคู่ คลาดเคลื่อน
      // ได้เฉพาะกรณี "เข้างานกลางเดือนนี้ + แก้ backPay/commission เดือนเดียวกัน"
      // ซึ่งจะถูกต้องอีกครั้งทันทีที่ generate/regenerate รอบถัดไป)
      const totals = computePayrollTotals({
        taxSsBaseSalary: payroll.baseSalary,
        payoutBaseSalary: payroll.baseSalary,
        positionAllowance: payroll.positionAllowance,
        diligenceAllowance: payroll.diligenceAllowance,
        backPay: newBackPay,
        commission: newCommission,
        professionalFee: payroll.professionalFee,
        professionalFeeTax: payroll.professionalFeeTax,
        studentLoanDeduction: payroll.studentLoanDeduction,
        securityDepositDeduction: payroll.securityDepositDeduction,
        lateDeduction: payroll.lateDeduction,
        absentDeduction: payroll.absentDeduction,
        unpaidLeaveDeduction: payroll.unpaidLeave,
        earlyLeaveDeduction: payroll.earlyLeaveDeduction,
        socialSecurityEnabled: payroll.user.socialSecurity,
      })

      updateData.backPay = newBackPay
      updateData.commission = newCommission
      updateData.socialSecurity = totals.socialSecurity
      updateData.taxDeduction = totals.taxDeduction
      updateData.taxDetail = totals.taxDetail
      updateData.netSalary = totals.netSalary
    }

    const updated = await prisma.payroll.update({ where: { id }, data: updateData })

    if (editingBackPay || editingCommission) {
      await createAuditLog({
        actorId: session.user.id,
        targetId: payroll.userId,
        targetType: 'Payroll',
        action: 'UPDATE',
        before: { backPay: payroll.backPay, commission: payroll.commission, netSalary: payroll.netSalary },
        after: { backPay: updated.backPay, commission: updated.commission, netSalary: updated.netSalary },
        ip: requestIp(req),
        userAgent: req.headers.get('user-agent') ?? undefined,
      })
    }

    return NextResponse.json({ payroll: updated })
  } catch (err) {
    return apiError(err)
  }
}

/** Soft-delete a payroll (and its 1:1 salary slip, same transaction) — payslips
 * are a legally-retained document (2+ years), so this is deliberately narrower
 * than the usual payroll-management roles (PAYROLL_DELETE_ROLES: SUPER_ADMIN/CEO
 * only, no HR, no MANAGER_HR — an executive decision, not a routine HR action).
 * Denied attempts are audit-logged too, same as successful ones. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params

    if (!PAYROLL_DELETE_ROLES.includes(session.user.role)) {
      const target = await prisma.payroll.findUnique({ where: { id }, select: { userId: true } })
      await createAuditLog({
        actorId: session.user.id,
        targetId: target?.userId ?? id,
        targetType: 'Payroll',
        action: 'DELETE',
        after: { payrollId: id, forbidden: true, attemptedRole: session.user.role },
        ip: requestIp(req),
        userAgent: req.headers.get('user-agent') ?? undefined,
      })
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await ensurePayrollPayslipColumns()
    await ensurePayrollFieldsBatch2()

    const existing = await prisma.payroll.findUnique({
      where: { id },
      select: { id: true, userId: true, deletedAt: true },
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const result = await softDelete({
      currentDeletedAt: existing.deletedAt,
      updateMany: (data) =>
        prisma.$transaction(async (tx) => {
          const payrollResult = await tx.payroll.updateMany({ where: { id, deletedAt: null }, data })
          if (payrollResult.count > 0) {
            await tx.salarySlip.updateMany({ where: { payrollId: id, deletedAt: null }, data })
          }
          return payrollResult
        }),
      audit: {
        actorId: session.user.id,
        targetId: existing.userId,
        targetType: 'Payroll',
        ip: requestIp(req),
        userAgent: req.headers.get('user-agent') ?? undefined,
      },
      auditExtra: { payrollId: id },
    })

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
