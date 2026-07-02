import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-handler'
import { prisma } from '@/lib/prisma'
import { verifyPayslipPdfAccessToken } from '@/lib/payslip-pdf-access'
import { fetchRawPdfBuffer } from '@/lib/cloudinary-service'
import { ensurePayrollPayslipColumns } from '@/lib/ensure-payroll-payslip-columns'
import {
  payslipPdfFilename,
  resolvePayslipPdfPublicId,
} from '@/lib/payslip-cloudinary-path'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const access = req.nextUrl.searchParams.get('access')
    if (!access) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tokenOk = await verifyPayslipPdfAccessToken(access, id)
    if (!tokenOk) {
      return NextResponse.json({ error: 'ลิงก์หมดอายุหรือไม่ถูกต้อง' }, { status: 403 })
    }

    await ensurePayrollPayslipColumns()

    const payroll = await prisma.payroll.findUnique({
      where: { id },
      select: {
        month: true,
        year: true,
        status: true,
        userId: true,
        payslipCloudinaryPublicId: true,
        user: { select: { employeeId: true } },
      },
    })
    if (!payroll || payroll.status !== 'APPROVED') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const publicId = await resolvePayslipPdfPublicId({
      payrollId: id,
      userId: payroll.userId,
      year: payroll.year,
      month: payroll.month,
      employeeId: payroll.user.employeeId,
      storedPublicId: payroll.payslipCloudinaryPublicId,
    })

    const buffer = await fetchRawPdfBuffer(publicId)
    if (!buffer?.length) {
      return NextResponse.json({ error: 'ไม่พบไฟล์ PDF' }, { status: 404 })
    }

    const filename = payslipPdfFilename({
      year: payroll.year,
      month: payroll.month,
      userId: payroll.userId,
      employeeId: payroll.user.employeeId,
    })
    const download = req.nextUrl.searchParams.get('download') === '1'

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': download
          ? `attachment; filename="${filename}"`
          : `inline; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (err) {
    return apiError(err)
  }
}
