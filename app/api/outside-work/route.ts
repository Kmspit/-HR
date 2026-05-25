import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyRole } from '@/lib/notifications'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isManager = ['MANAGER_HR', 'ADMIN'].includes(session.user.role)
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')

  const requests = await prisma.outsideWorkRequest.findMany({
    where: isManager && !userId ? {} : { userId: userId ?? session.user.id },
    include: { user: { select: { name: true, department: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return NextResponse.json({ requests })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { date, startTime, endTime, place, purpose, client, note } = body

  if (!date || !startTime || !endTime || !place || !purpose) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const request = await prisma.outsideWorkRequest.create({
    data: {
      userId: session.user.id,
      date: new Date(date),
      startTime,
      endTime,
      place,
      purpose,
      client,
      note,
    },
  })

  await notifyRole('ADMIN', 'OUTSIDE_REQUEST', 'เธเธณเธเธญเธญเธญเธเธเธญเธเธชเธ–เธฒเธเธ—เธตเน', `${session.user.name} เธเธญเธญเธญเธเธเธญเธเธชเธ–เธฒเธเธ—เธตเนเธงเธฑเธเธ—เธตเน ${new Date(date).toLocaleDateString('th-TH')}`, '/approvals')

  return NextResponse.json({ request })
}
