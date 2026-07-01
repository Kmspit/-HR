import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { HR_ROLES } from '@/lib/access-control'

const DOC_TYPE_LABELS: Record<string, string> = {
  EMPLOYMENT_CERT: 'หนังสือรับรองการทำงาน',
  SALARY_CERT: 'หนังสือรับรองเงินเดือน',
  CONTRACT_COPY: 'สำเนาสัญญาจ้างงาน',
  SALARY_SLIP: 'สลิปเงินเดือนย้อนหลัง',
  OTHER: 'เอกสารอื่นๆ',
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const isHr = (HR_ROLES as readonly string[]).includes(session.user.role)
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')

    if (isHr) {
      const where: Record<string, unknown> = {}
      if (status) where.status = status

      const requests = await prisma.documentRequest.findMany({
        where,
        include: {
          user: { select: { name: true, employeeId: true, department: true } },
          handledBy: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
      return NextResponse.json({ requests })
    }

    const requests = await prisma.documentRequest.findMany({
      where: { userId: session.user.id },
      include: { handledBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ requests })
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { type, purpose } = await req.json()
    if (!type || !DOC_TYPE_LABELS[type]) {
      return NextResponse.json({ error: 'ประเภทเอกสารไม่ถูกต้อง' }, { status: 400 })
    }

    const request = await prisma.documentRequest.create({
      data: {
        userId: session.user.id,
        type,
        purpose: purpose?.trim() || null,
        status: 'PENDING',
      },
    })

    return NextResponse.json({ request }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id || !(HR_ROLES as readonly string[]).includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id, status, notes } = await req.json()
    if (!id || !['PROCESSING', 'READY', 'REJECTED'].includes(status)) {
      return NextResponse.json({ error: 'id และ status จำเป็น' }, { status: 400 })
    }

    const request = await prisma.documentRequest.update({
      where: { id },
      data: {
        status,
        notes: notes ?? undefined,
        handledById: session.user.id,
        handledAt: new Date(),
      },
    })

    return NextResponse.json({ request })
  } catch (err) {
    return apiError(err)
  }
}
