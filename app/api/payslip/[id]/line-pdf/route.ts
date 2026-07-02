import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-handler'
import { prisma } from '@/lib/prisma'
import { verifyPayslipPdfAccessToken } from '@/lib/payslip-pdf-access'
import { fetchRawPdfBuffer } from '@/lib/cloudinary-service'

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

    const verified = await verifyPayslipPdfAccessToken(access, id)
    if (!verified.ok || !verified.cloudinaryPublicId) {
      return NextResponse.json({ error: 'ลิงก์หมดอายุหรือไม่ถูกต้อง' }, { status: 403 })
    }

    const payroll = await prisma.payroll.findUnique({
      where: { id },
      select: {
        month: true,
        year: true,
        status: true,
        userId: true,
        user: { select: { employeeId: true } },
      },
    })
    if (!payroll || payroll.status !== 'APPROVED') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const buffer = await fetchRawPdfBuffer(verified.cloudinaryPublicId)
    if (!buffer?.length) {
      return NextResponse.json({ error: 'ไม่พบไฟล์ PDF' }, { status: 404 })
    }

    const empKey = payroll.user.employeeId ?? payroll.userId.slice(0, 6)
    const filename = `slip_${payroll.year}_${String(payroll.month).padStart(2, '0')}_${empKey}.pdf`
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
