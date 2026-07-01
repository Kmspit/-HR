import type { NotificationType } from '@prisma/client'
import { getTabForNotification } from './constants'
import type { NotificationTab, NotificationTabCounts } from './types'

type Row = { type: NotificationType; title: string; message: string; isRead: boolean }

const EMPTY_TAB: NotificationTabCounts = {
  all: { total: 0, unread: 0 },
  approvals: { total: 0, unread: 0 },
  attendance: { total: 0, unread: 0 },
  warnings: { total: 0, unread: 0 },
  system: { total: 0, unread: 0 },
}

export function computeTabCounts(rows: Row[]): NotificationTabCounts {
  const counts = structuredClone(EMPTY_TAB)
  for (const row of rows) {
    counts.all.total += 1
    if (!row.isRead) counts.all.unread += 1
    const tab = getTabForNotification(row.type, row.title, row.message)
    counts[tab].total += 1
    if (!row.isRead) counts[tab].unread += 1
  }
  return counts
}
