import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import type { NotificationType } from '@prisma/client'

const CATEGORY_TYPES: Record<string, string[]> = {
  task:     ['TASK_ASSIGNED', 'TASK_SUBMITTED', 'TASK_APPROVED', 'TASK_REVISION', 'TASK_WAITING_DOC'],
  court:    ['TASK_COURT_REMINDER', 'TASK_APPOINTMENT_REMINDER'],
  deadline: ['TASK_DEADLINE_REMINDER', 'TASK_OVERDUE'],
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const limit    = parseInt(searchParams.get('limit') ?? '20')
    const unread   = searchParams.get('unread') === 'true'
    const category = searchParams.get('category') ?? ''
    const typeFilter = CATEGORY_TYPES[category]

    const notifications = await prisma.notification.findMany({
      where: {
        userId: session.user.id,
        ...(unread ? { isRead: false } : {}),
        ...(typeFilter ? { type: { in: typeFilter as NotificationType[] } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    const unreadCount = await prisma.notification.count({
      where: { userId: session.user.id, isRead: false },
    })

    return NextResponse.json({ notifications, unreadCount })
  } catch (err) {
    return apiError(err)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json() as { id?: string }

    if (body.id) {
      await prisma.notification.updateMany({
        where: { id: body.id, userId: session.user.id },
        data: { isRead: true },
      })
    } else {
      await prisma.notification.updateMany({
        where: { userId: session.user.id, isRead: false },
        data: { isRead: true },
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
