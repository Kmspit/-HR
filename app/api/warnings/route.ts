import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { saveUpload } from '@/lib/save-upload'

const MAX_PDF_BYTES = 10 * 1024 * 1024

function isPdfFile(file: File) {
  const name = file.name.toLowerCase()
  return file.type === 'application/pdf' || name.endsWith('.pdf')
}

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
    let level: number | string | null = null
    let reason: string
    let description: string | null = null
    let useAutoLevel = true
    let pdfFile: File | null = null

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      userId = (formData.get('userId') as string) || ''
      level = formData.get('level') as string | null
      reason = (formData.get('reason') as string) || ''
      description = (formData.get('description') as string) || null
      useAutoLevel = formData.get('useAutoLevel') !== 'false'
      const file = formData.get('file') as File | null
      if (file && file.size > 0) pdfFile = file
    } else {
      const body = await req.json()
      userId = body.userId
      level = body.level
      reason = body.reason
      description = body.description
      useAutoLevel = body.useAutoLevel !== false
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
    const autoLevel = Math.min(priorCount + 1, 3)
    const levelToUse =
      useAutoLevel !== false && (level == null || level === '')
        ? autoLevel
        : Math.min(Math.max(Number(level) || autoLevel, 1), 3)

    let fileUrl: string | null = null
    if (pdfFile) {
      const saved = await saveUpload(pdfFile, 'warning', userId)
      if (!saved) {
        return NextResponse.json({ error: 'บันทึกไฟล์ PDF ไม่สำเร็จ' }, { status: 500 })
      }
      fileUrl = saved
    }

    const now = new Date()
    const warning = await prisma.warning.create({
      data: {
        userId,
        issuedById: session.user.id,
        level: levelToUse,
        reason,
        description: description || null,
        fileUrl,
        isAuto: false,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
      },
    })

    const base = (process.env.NEXTAUTH_URL ?? '').replace(/\/$/, '')
    const fileLink = fileUrl
      ? fileUrl.startsWith('http')
        ? fileUrl
        : `${base}${fileUrl}`
      : null

    await prisma.notification.create({
      data: {
        userId,
        type: 'WARNING_ISSUED',
        title: `ได้รับใบเตือนระดับ ${levelToUse}`,
        message: fileLink ? `${reason}\n\n📎 ไฟล์: ${fileLink}` : reason,
        link: '/warnings',
      },
    }).catch((e) => console.error('[warning notify]', e))

    return NextResponse.json({
      warning,
      priorCount,
      warningNumber: priorCount + 1,
      levelUsed: levelToUse,
      fileUrl,
    })
  } catch (err) {
    return apiError(err)
  }
}
