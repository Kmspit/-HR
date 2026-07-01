import { prisma } from '@/lib/prisma'
import { announcementEmitter } from '@/lib/announcement-events'
import type { Notification } from '@prisma/client'
import type { NotificationItem } from './types'

export function toNotificationItem(n: Notification): NotificationItem {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    link: n.link,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
    taskId: n.taskId,
  }
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, isRead: false } })
}

export async function broadcastNotificationUpdate(userId: string, notification?: NotificationItem): Promise<void> {
  const count = await getUnreadCount(userId)
  announcementEmitter.emit('notification-count', { userId, count })
  if (notification) {
    announcementEmitter.emit('new-notification', { userId, notification })
  }
}

export async function broadcastNotificationUpdates(userIds: string[]): Promise<void> {
  const unique = [...new Set(userIds)]
  if (unique.length === 0) return
  const grouped = await prisma.notification.groupBy({
    by: ['userId'],
    where: { userId: { in: unique }, isRead: false },
    _count: { id: true },
  })
  const countMap = Object.fromEntries(grouped.map((g) => [g.userId, g._count.id]))
  for (const uid of unique) {
    announcementEmitter.emit('notification-count', { userId: uid, count: countMap[uid] ?? 0 })
  }
}
