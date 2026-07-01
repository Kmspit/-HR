'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Bell, CheckCheck, Loader2 } from 'lucide-react'
import { formatThaiDateTime } from '@/lib/utils'
import { apiJson } from '@/lib/client-api'
import { useNotificationStream } from '@/hooks/useNotificationStream'
import {
  getPriority, getTabForNotification, matchesTab,
  PRIORITY_STYLES, resolveLink, TAB_ICONS, TAB_LABELS, TYPE_ICONS,
} from '@/lib/notification-center/constants'
import { computeTabCounts } from '@/lib/notification-center/tab-counts'
import type {
  NotificationCenterPayload, NotificationItem, NotificationTab,
} from '@/lib/notification-center/types'

type Props = NotificationCenterPayload

const TABS: NotificationTab[] = ['all', 'approvals', 'attendance', 'warnings', 'system']

function NotificationCard({
  item,
  onClick,
}: {
  item: NotificationItem
  onClick: (item: NotificationItem) => void
}) {
  const priority = getPriority(item.type, item.title, item.message)
  const styles = PRIORITY_STYLES[priority]
  const tab = getTabForNotification(item.type, item.title, item.message)

  return (
    <button
      type="button"
      onClick={() => onClick(item)}
      className={`w-full text-left rounded-2xl border border-slate-200 dark:border-white/[0.07] border-l-4 ${styles.border}
        bg-white dark:bg-slate-900/80 shadow-sm hover:shadow-md transition-all duration-200
        ${!item.isRead ? 'ring-1 ring-blue-500/10 dark:ring-blue-400/10' : 'opacity-90 hover:opacity-100'}`}
    >
      <div className="p-4 sm:p-5 flex items-start gap-3">
        <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-xl
          ${!item.isRead ? 'bg-slate-100 dark:bg-white/[0.06]' : 'bg-slate-50 dark:bg-white/[0.03]'}`}>
          {TYPE_ICONS[item.type] ?? TAB_ICONS[tab] ?? '🔔'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold border ${styles.badge}`}>
              {styles.label}
            </span>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
              {TAB_LABELS[tab]}
            </span>
            {!item.isRead && <span className={`h-2 w-2 rounded-full ${styles.dot} ml-auto sm:ml-0`} />}
          </div>
          <p className={`text-[14px] font-bold leading-snug ${item.isRead ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-white'}`}>
            {item.title}
          </p>
          {item.message && (
            <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
              {item.message}
            </p>
          )}
          <p className="mt-2 text-[11px] text-slate-400">{formatThaiDateTime(item.createdAt)}</p>
        </div>
      </div>
    </button>
  )
}

export default function NotificationCenterClient({
  notifications: initial,
  unreadCount: initialUnread,
  tabCounts: initialTabCounts,
}: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<NotificationTab>('all')
  const [items, setItems] = useState(initial)
  const [unreadCount, setUnreadCount] = useState(initialUnread)
  const [tabCounts, setTabCounts] = useState(initialTabCounts)
  const [markingAll, setMarkingAll] = useState(false)

  const recomputeCounts = useCallback((list: NotificationItem[]) => {
    setTabCounts(computeTabCounts(list))
    setUnreadCount(list.filter((n) => !n.isRead).length)
  }, [])

  useNotificationStream({
    onCount: (count) => {
      setUnreadCount(count)
      if (count === 0) {
        setItems((prev) => {
          const next = prev.map((n) => ({ ...n, isRead: true }))
          setTabCounts(computeTabCounts(next))
          return next
        })
      }
    },
    onNew: (notif) => {
      setItems((prev) => {
        if (prev.some((n) => n.id === notif.id)) return prev
        const next = [notif, ...prev].slice(0, 200)
        setTabCounts(computeTabCounts(next))
        setUnreadCount(next.filter((n) => !n.isRead).length)
        return next
      })
    },
  })

  const filtered = useMemo(
    () => items.filter((n) => matchesTab(n.type, n.title, n.message, tab)),
    [items, tab],
  )

  const markRead = useCallback(async (id: string) => {
    const { ok } = await apiJson('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!ok) {
      toast.error('ไม่สามารถทำเครื่องหมายว่าอ่านแล้ว')
      return
    }
    setItems((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      recomputeCounts(next)
      return next
    })
  }, [recomputeCounts])

  const markAllRead = useCallback(async () => {
    setMarkingAll(true)
    try {
      const { ok } = await apiJson('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!ok) {
        toast.error('ไม่สามารถอ่านทั้งหมดได้')
        return
      }
      setItems((prev) => {
        const next = prev.map((n) => ({ ...n, isRead: true }))
        recomputeCounts(next)
        return next
      })
      toast.success('อ่านการแจ้งเตือนทั้งหมดแล้ว')
    } catch {
      toast.error('เกิดข้อผิดพลาด')
    } finally {
      setMarkingAll(false)
    }
  }, [recomputeCounts])

  const handleClick = useCallback(
    (item: NotificationItem) => {
      if (!item.isRead) markRead(item.id)
      router.push(resolveLink(item.type, item.link))
    },
    [markRead, router],
  )

  const tabUnread = (t: NotificationTab) => tabCounts[t]?.unread ?? 0

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-white/[0.07] bg-gradient-to-r from-slate-50 to-white dark:from-slate-900/80 dark:to-slate-900/40 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[14px] font-bold text-slate-900 dark:text-white">ศูนย์แจ้งเตือน</p>
            <p className="text-[12px] text-slate-500">
              {unreadCount > 0 ? `${unreadCount} รายการยังไม่ได้อ่าน` : 'อ่านครบแล้ว'}
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            disabled={markingAll}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50 btn-press"
          >
            {markingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
            อ่านทั้งหมด
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
        {TABS.map((t) => {
          const active = tab === t
          const unread = tabUnread(t)
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-all border btn-press
                ${active
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/[0.08] hover:border-blue-300 dark:hover:border-blue-500/30'
                }`}
            >
              <span>{TAB_ICONS[t]}</span>
              {TAB_LABELS[t]}
              {unread > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold min-w-[18px] text-center
                  ${active ? 'bg-white/25 text-white' : 'bg-red-500 text-white'}`}>
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Priority legend */}
      <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" /> ด่วน</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> ควรทราบ</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500" /> ทั่วไป</span>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-slate-900/30 py-16 text-center">
          <p className="text-4xl mb-2">{TAB_ICONS[tab]}</p>
          <p className="text-[14px] font-semibold text-slate-600 dark:text-slate-300">ไม่มีการแจ้งเตือนในหมวดนี้</p>
          <p className="text-[12px] text-slate-400 mt-1">แจ้งเตือนใหม่จะปรากฏที่นี่แบบเรียลไทม์</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <NotificationCard key={item.id} item={item} onClick={handleClick} />
          ))}
        </div>
      )}
    </div>
  )
}
