import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    const isManager = ['MANAGER_HR', 'ADMIN'].includes(session.user.role)

    const whereUserId = isManager && !userId ? undefined : (userId ?? session.user.id)

    const warnings = await prisma.warning.findMany({
      where: whereUserId ? { userId: whereUserId } : {},
      include: { user: { select: { name: true, employeeId: true, department: true } } },
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

    const body = await req.json()
    const { userId, level, reason, description } = body

    if (!userId || !level || !reason) {
      return NextResponse.json({ error: 'กรุณากรอกข้อมูลให้ครบ' }, { status: 400 })
    }

    const now = new Date()
    const warning = await prisma.warning.create({
      data: {
        userId,
        issuedById: session.user.id,
        level: Number(level),
        reason,
        description: description || null,
        isAuto: false,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
      },
    })

    await prisma.notification.create({
      data: {
        userId,
        type: 'WARNING_ISSUED',
        title: `ได้รับใบเตือนระดับ ${level}`,
        message: reason,
        link: '/warnings',
      },
    }).catch((e) => console.error('[warning notify]', e))

    return NextResponse.json({ warning })
  } catch (err) {
    return apiError(err)
  }
}
