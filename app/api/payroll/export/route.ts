import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { canManagePayroll } from '@/lib/access-control'
import { buildBranchScope, branchNestedUserWhere, parseBranchQueryParam } from '@/lib/branch-scope'
import { buildPayrollExcel, type PayrollExportRow } from '@/lib/payroll-excel-export'
import { ensurePayrollFieldsBatch2 } from '@/lib/ensure-payroll-fields-batch-2'

const MONTH_NAMES_TH = [
  '', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id || !canManagePayroll(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    await ensurePayrollFieldsBatch2()

    const { searchParams } = new URL(req.url)
    const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1))
    const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))
    if (!Number.isFinite(month) || !Number.isFinite(year) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'month/year ไม่ถูกต้อง' }, { status: 400 })
    }
    const branchParam = parseBranchQueryParam(searchParams.get('branchId') ?? undefined)
    const scope = buildBranchScope(session.user, { branchId: branchParam })
    const nestedUser = branchNestedUserWhere(scope)

    const payrolls = await prisma.payroll.findMany({
      where: { month, year, deletedAt: null, ...(nestedUser ? { user: nestedUser } : {}) },
      include: {
        user: {
          select: {
            name: true,
            employeeId: true,
            position: true,
            branch: { select: { name: true } },
            division: { select: { name: true, sortOrder: true } },
            orgDepartment: { select: { name: true, sortOrder: true } },
          },
        },
      },
    })

    if (payrolls.length === 0) {
      return NextResponse.json({ error: 'ไม่มีข้อมูล payroll เดือนนี้ในสาขาที่เลือก' }, { status: 404 })
    }

    // เงินประกัน 6 งวด (หรือตามแผน) — ต้อง join SecurityDepositPlan เพื่อรู้
    // totalInstallments มาโชว์เป็น "3/6" ในหมายเหตุ (Payroll เก็บแค่ installmentNo)
    const userIds = [...new Set(payrolls.map((p) => p.userId))]
    const plans = await prisma.securityDepositPlan.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, totalInstallments: true },
    })
    const totalInstallmentsByUser = new Map(plans.map((p) => [p.userId, p.totalInstallments]))

    const rowsByBranch = new Map<string, PayrollExportRow[]>()
    for (const p of payrolls) {
      const branchName = p.user.branch?.name ?? 'ไม่ระบุสาขา'
      const row: PayrollExportRow = {
        employeeId: p.user.employeeId,
        name: p.user.name,
        position: p.user.position,
        branchName,
        divisionName: p.user.division?.name ?? null,
        divisionSortOrder: p.user.division?.sortOrder ?? 0,
        departmentName: p.user.orgDepartment?.name ?? null,
        departmentSortOrder: p.user.orgDepartment?.sortOrder ?? 0,
        baseSalary: p.baseSalary,
        positionAllowance: p.positionAllowance,
        diligenceAllowance: p.diligenceAllowance,
        backPay: p.backPay,
        otherAddition: p.otherAddition,
        professionalFee: p.professionalFee,
        commission: p.commission,
        socialSecurity: p.socialSecurity,
        professionalFeeTax: p.professionalFeeTax,
        taxDetail: p.taxDetail,
        lateDeduction: p.lateDeduction,
        absentDeduction: p.absentDeduction,
        unpaidLeave: p.unpaidLeave,
        earlyLeaveDeduction: p.earlyLeaveDeduction,
        otherDeduction: p.otherDeduction,
        securityDepositDeduction: p.securityDepositDeduction,
        securityDepositInstallmentNo: p.securityDepositInstallmentNo,
        securityDepositTotalInstallments: totalInstallmentsByUser.get(p.userId) ?? null,
        studentLoanDeduction: p.studentLoanDeduction,
        netSalary: p.netSalary,
        note: p.note,
      }
      const list = rowsByBranch.get(branchName)
      if (list) list.push(row); else rowsByBranch.set(branchName, [row])
    }

    const buffer = await buildPayrollExcel(rowsByBranch, {
      month,
      year,
      monthLabel: MONTH_NAMES_TH[month] ?? String(month),
    })

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="payroll-${year}-${String(month).padStart(2, '0')}.xlsx"`,
      },
    })
  } catch (err) {
    return apiError(err)
  }
}
