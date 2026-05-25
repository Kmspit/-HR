import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/notifications — get user notifications
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const limit  = parseInt(searchParams.get('limit') ?? '20')
  const unread = searchParams.get('unread') === 'true'

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id, ...(unread ? { isRead: false } : {}) },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  const unreadCount = await prisma.notification.count({
    where: { userId: session.user.id, isRead: false },
  })

  return NextResponse.json({ notifications, unreadCount })
}

// PATCH /api/notifications — mark all as read
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { id?: string }

  if (body.id) {
    await prisma.notification.update({ where: { id: body.id, userId: session.user.id }, data: { isRead: true } })
  } else {
    await prisma.notification.updateMany({ where: { userId: session.user.id, isRead: false }, data: { isRead: true } })
  }

  return NextResponse.json({ success: true })
}
