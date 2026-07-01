import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { matchesTab, typesForTab } from '@/lib/notification-center/constants'
import { computeTabCounts } from '@/lib/notification-center/tab-counts'
import { broadcastNotificationUpdate } from '@/lib/notification-center/broadcast'
import type { NotificationTab } from '@/lib/notification-center/types'
import type { Prisma } from '@prisma/client'

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
    const cursor = searchParams.get('cursor')

    const baseWhere: Prisma.NotificationWhereInput = { userId: session.user.id }
    if (unreadOnly) baseWhere.isRead = false

    const tabTypes = typesForTab(tab)
    if (tabTypes) {
      baseWhere.type = { in: tabTypes }
    }

    const rows = await prisma.notification.findMany({
      where: baseWhere,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, type: true, title: true, message: true, link: true,
        isRead: true, createdAt: true, taskId: true,
      },
    })

    const hasMore = rows.length > limit
    const pageRows = hasMore ? rows.slice(0, limit) : rows

    let filtered = pageRows
    if (tab !== 'all' && tab !== 'attendance') {
      filtered = pageRows
    } else if (tab === 'attendance') {
      filtered = pageRows.filter((n) => matchesTab(n.type, n.title, n.message, tab))
    }

    const countRows = await prisma.notification.findMany({
      where: { userId: session.user.id },
      select: { type: true, title: true, message: true, isRead: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    const tabCounts = computeTabCounts(countRows)
    const unreadCount = await prisma.notification.count({
      where: { userId: session.user.id, isRead: false },
    })

    const notifications = filtered.map((n) => ({
      ...n,
      createdAt: n.createdAt.toISOString(),
    }))

    return NextResponse.json({
      notifications,
      unreadCount,
      tabCounts,
      nextCursor: hasMore ? pageRows[pageRows.length - 1]?.id ?? null : null,
    })
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
