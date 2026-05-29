import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { isPdfFile, storeWarningPdf } from '@/lib/warning-pdf'
import { deliverWarningToEmployee, ensureWarningPdfStored } from '@/lib/warning-delivery'

const MAX_PDF_BYTES = 10 * 1024 * 1024

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    const isManager = ['MANAGER_HR', 'ADMIN'].includes(session.user.role)

    const where = isManager
      ? userId
        ? { userId }
        : {}
      : { userId: session.user.id }

    const warnings = await prisma.warning.findMany({
      where,
      include: {
        user: { select: { name: true, employeeId: true, department: true } },
        issuedBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    return NextResponse.json({ warnings })
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id || !['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const contentType = req.headers.get('content-type') ?? ''
    let userId: string
    let reason: string
    let description: string | null = null
    let sendToEmployee = true
    let pdfFile: File | null = null

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      userId = (formData.get('userId') as string) || ''
      reason = (formData.get('reason') as string) || ''
      description = (formData.get('description') as string) || null
      sendToEmployee = formData.get('sendToEmployee') !== 'false'
      const file = formData.get('file') as File | null
      if (file && file.size > 0) pdfFile = file
    } else {
      const body = await req.json()
      userId = body.userId
      reason = body.reason
      description = body.description
      sendToEmployee = body.sendToEmployee !== false
    }

    if (!userId || !reason) {
      return NextResponse.json({ error: 'กรุณาเลือกพนักงานและระบุเหตุผล' }, { status: 400 })
    }

    if (pdfFile) {
      if (!isPdfFile(pdfFile)) {
        return NextResponse.json({ error: 'อนุญาตเฉพาะไฟล์ PDF' }, { status: 400 })
      }
      if (pdfFile.size > MAX_PDF_BYTES) {
        return NextResponse.json({ error: 'ไฟล์ PDF ต้องไม่เกิน 10 MB' }, { status: 400 })
      }
    }

    const priorCount = await prisma.warning.count({ where: { userId } })
    const levelToUse = Math.min(priorCount + 1, 3)
    const warningNumber = priorCount + 1

    const now = new Date()
    const warning = await prisma.warning.create({
      data: {
        userId,
        issuedById: session.user.id,
        level: levelToUse,
        reason,
        description: description || null,
        fileUrl: null,
        pdfBase64: null,
        isAuto: false,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
      },
    })

    let fileUrl: string | null = null
    if (pdfFile) {
      try {
        const stored = await storeWarningPdf(warning.id, userId, pdfFile)
        if (!stored) {
          await prisma.warning.delete({ where: { id: warning.id } })
          return NextResponse.json({ error: 'บันทึกไฟล์ PDF ไม่สำเร็จ' }, { status: 500 })
        }
        fileUrl = stored.fileUrl
        await prisma.warning.update({
          where: { id: warning.id },
          data: { fileUrl: stored.fileUrl, pdfBase64: stored.pdfBase64 },
        })
      } catch (e) {
        await prisma.warning.delete({ where: { id: warning.id } })
        if (e instanceof Error && e.message === 'PDF_TOO_LARGE') {
          return NextResponse.json({ error: 'ไฟล์ PDF ต้องไม่เกิน 10 MB' }, { status: 400 })
        }
        return NextResponse.json({ error: 'บันทึกไฟล์ PDF ไม่สำเร็จ' }, { status: 500 })
      }
    }

    try {
      await ensureWarningPdfStored(warning.id)
    } catch (e) {
      console.error('[warning-pdf-auto]', e)
    }

    let delivery: Awaited<ReturnType<typeof deliverWarningToEmployee>> | null = null
    if (sendToEmployee) {
      delivery = await deliverWarningToEmployee(warning.id, { warningNumber })
    } else {
      await prisma.warning.update({
        where: { id: warning.id },
        data: { lineDeliveryStatus: null },
      })
      await prisma.notification.create({
        data: {
          userId,
          type: 'WARNING_ISSUED',
          title: `ได้รับใบเตือน (ครั้งที่ ${warningNumber})`,
          message: reason,
          link: '/warnings',
        },
      }).catch((e) => console.error('[warning notify]', e))
    }

    const final = await prisma.warning.findUnique({
      where: { id: warning.id },
      select: { fileUrl: true },
    })

    return NextResponse.json({
      warning: { id: warning.id, fileUrl: final?.fileUrl ?? fileUrl },
      priorCount,
      warningNumber,
      levelUsed: levelToUse,
      fileUrl: final?.fileUrl ?? fileUrl,
      sent: sendToEmployee,
      lineDelivery: delivery
        ? {
            status: delivery.lineDeliveryStatus,
            sentAt: delivery.lineSentAt,
            lineUserId: delivery.lineUserId,
            errorMessage: delivery.lineErrorMessage,
          }
        : null,
    })
  } catch (err) {
    return apiError(err)
  }
}
