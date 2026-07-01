import type { NotificationType } from '@prisma/client'

export type NotificationTab = 'all' | 'approvals' | 'attendance' | 'warnings' | 'system'

export type NotificationPriority = 'urgent' | 'warning' | 'info'

export type NotificationItem = {
  id: string
  type: NotificationType
  title: string
  message: string
  link: string | null
  isRead: boolean
  createdAt: string
  taskId?: string | null
}

export type NotificationTabCounts = Record<NotificationTab, { total: number; unread: number }>

export type NotificationCenterPayload = {
  notifications: NotificationItem[]
  unreadCount: number
  tabCounts: NotificationTabCounts
}
