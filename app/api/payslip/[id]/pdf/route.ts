import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { generateSalarySlipPdf } from '@/lib/payroll-pdf'
import { parseTaxDetail } from '@/lib/payroll-tax'
import { HR_ROLES } from '@/lib/access-control'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

    if (!payroll) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isHr = (HR_ROLES as readonly string[]).includes(session.user.role)
    if (payroll.userId !== session.user.id && !isHr) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const settings = await prisma.companySettings.findUnique({ where: { id: 'singleton' } })
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
