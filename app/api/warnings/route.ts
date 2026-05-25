import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
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
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { userId, level, reason, description } = body

  if (!userId || !level || !reason) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const now = new Date()
  const warning = await prisma.warning.create({
    data: {
      userId,
      issuedById: session.user.id,
      level,
      reason,
      description,
      isAuto: false,
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    },
  })

  await prisma.notification.create({
    data: {
      userId,
      type: 'WARNING_ISSUED',
      title: `เนเธ”เนเธฃเธฑเธเนเธเน€เธ•เธทเธญเธเธฃเธฐเธ”เธฑเธ ${level}`,
      message: reason,
      link: '/warnings',
    },
  })

  return NextResponse.json({ warning })
}
