import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { generateSalarySlipPdf } from '@/lib/payroll-pdf'
import { parseTaxDetail } from '@/lib/payroll-tax'
import { HR_ROLES } from '@/lib/access-control'
import { buildBranchScope, branchUserWhere } from '@/lib/branch-scope'
import { getCachedCompanySettings } from '@/lib/company-settings-cache'
import { ensurePayrollPayslipColumns } from '@/lib/ensure-payroll-payslip-columns'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // __PDFKIT_FIX_DIAG_TEMP__ — temporary, remove before merge.
    if (req.nextUrl.searchParams.get('__pdfkitfixdiag') === 'f9k2m5xw') {
      try {
        const buf = await generateSalarySlipPdf({
          companyName: 'ทดสอบ', employeeName: 'ทดสอบ', employeeId: null, department: null,
          position: null, month: 1, year: 2026, baseSalary: 1000, lateDeduction: 0,
          absentDeduction: 0, unpaidLeave: 0, socialSecurity: 0, taxDeduction: 0,
          otherDeduction: 0, otherAddition: 0, netSalary: 1000, lateDays: 0, absentDays: 0,
          lateMinutes: 0, taxDetail: null,
        })
        return NextResponse.json({ diag: true, ok: true, bytes: buf.length })
      } catch (err) {
        return NextResponse.json(
          { diag: true, ok: false, error: err instanceof Error ? err.message : String(err) },
          { status: 500 },
        )
      }
    }

    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await ensurePayrollPayslipColumns()

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

    const taxDetail = parseTaxDetail(payroll.taxDetail ?? null)

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

    return new NextResponse(pdfBuffer.buffer as ArrayBuffer, {
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
