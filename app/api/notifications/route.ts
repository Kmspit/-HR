import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { matchesTab } from '@/lib/notification-center/constants'
import { computeTabCounts } from '@/lib/notification-center/tab-counts'
import { broadcastNotificationUpdate } from '@/lib/notification-center/broadcast'
import type { NotificationTab } from '@/lib/notification-center/types'

const VALID_TABS: NotificationTab[] = ['all', 'approvals', 'attendance', 'warnings', 'system']

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 100)
    const unreadOnly = searchParams.get('unread') === 'true'
    const tabParam = (searchParams.get('tab') ?? 'all') as NotificationTab
    const tab: NotificationTab = VALID_TABS.includes(tabParam) ? tabParam : 'all'

    const allRows = await prisma.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, type: true, title: true, message: true, link: true,
        isRead: true, createdAt: true, taskId: true,
      },
    })

    const tabCounts = computeTabCounts(allRows)

    let filtered = allRows
    if (tab !== 'all') {
      filtered = filtered.filter((n) => matchesTab(n.type, n.title, n.message, tab))
    }
    if (unreadOnly) {
      filtered = filtered.filter((n) => !n.isRead)
    }

    const notifications = filtered.slice(0, limit).map((n) => ({
      ...n,
      createdAt: n.createdAt.toISOString(),
    }))

    const unreadCount = tabCounts.all.unread

    return NextResponse.json({ notifications, unreadCount, tabCounts })
  } catch (err) {
    return apiError(err)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json() as { id?: string }
    const userId = session.user.id

    if (body.id) {
      await prisma.notification.updateMany({
        where: { id: body.id, userId },
        data: { isRead: true },
      })
    } else {
      await prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true },
      })
    }

    await broadcastNotificationUpdate(userId)

    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
