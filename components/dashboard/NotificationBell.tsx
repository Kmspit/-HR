'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { apiJson } from '@/lib/client-api'
import { formatThaiDateTime } from '@/lib/utils'
import { useUnreadCount, useNotificationStream } from '@/hooks/useNotificationStream'
import {
  getPriority, PRIORITY_STYLES, resolveLink, TYPE_ICONS,
} from '@/lib/notification-center/constants'
import type { NotificationItem } from '@/lib/notification-center/types'

type Notif = NotificationItem

type Props = {
  initialCount: number
}

export default function NotificationBell({ initialCount }: Props) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notif[]>([])
  const [count, setCount] = useUnreadCount(initialCount)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useNotificationStream({
    onCount: setCount,
    onNew: (notif) => {
      setItems((prev) => {
        if (prev.some((n) => n.id === notif.id)) return prev
        return [notif, ...prev].slice(0, 10)
      })
    },
  })

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const load = useCallback(async () => {
    if (loaded) return
    setLoading(true)
    try {
      const { data } = await apiJson<{ notifications: Notif[]; unreadCount: number }>('/api/notifications?limit=10')
      setItems(data.notifications ?? [])
      setCount(data.unreadCount ?? 0)
      setLoaded(true)
    } catch (error) {
      console.error('[NotificationBell] fetch error:', error)
    } finally {
      setLoading(false)
    }
  }, [loaded, setCount])

  const toggle = () => {
    if (!open) load()
    setOpen((prev) => !prev)
  }

  const markRead = useCallback(async (id: string) => {
    await apiJson('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)))
    setCount((prev) => Math.max(0, prev - 1))
  }, [setCount])

  const markAllRead = useCallback(async () => {
    await apiJson('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })))
    setCount(0)
  }, [setCount])

  const handleClick = useCallback(
    (n: Notif) => {
      if (!n.isRead) markRead(n.id)
      const href = resolveLink(n.type, n.link)
      setOpen(false)
      router.push(href)
    },
    [markRead, router],
  )

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        className="relative flex h-8 w-8 items-center justify-center rounded-xl border transition-all
          dark:border-white/8 dark:bg-white/[0.03] dark:text-slate-400 dark:hover:bg-white/[0.07] dark:hover:text-slate-200
          light:border-slate-200 light:bg-white light:text-slate-500 light:shadow-sm light:hover:text-slate-700"
        aria-label="การแจ้งเตือน"
        aria-expanded={open}
      >
        <Bell size={15} />
        {count > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex min-h-[14px] min-w-[14px] items-center justify-center
              rounded-full bg-red-500 px-0.5 text-[8px] font-bold text-white leading-none"
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)} />

          <div
            className="absolute right-0 top-full mt-2 w-80 z-50 overflow-hidden rounded-2xl
              border dark:border-white/10 light:border-slate-200
              dark:bg-slate-900 light:bg-white
              shadow-2xl"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b dark:border-white/[0.06] light:border-slate-100">
              <span className="text-[13px] font-semibold dark:text-white light:text-slate-800">การแจ้งเตือน</span>
              {count > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                >
                  <CheckCheck size={12} />
                  อ่านทั้งหมด
                </button>
              )}
            </div>

            <div className="max-h-[340px] overflow-y-auto overscroll-contain">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : items.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-2xl mb-1">🔔</p>
                  <p className="text-xs dark:text-slate-500 light:text-slate-400">ไม่มีการแจ้งเตือน</p>
                </div>
              ) : (
                <div className="divide-y dark:divide-white/[0.04] light:divide-slate-100">
                  {items.map((n) => {
                    const priority = getPriority(n.type, n.title, n.message)
                    const dot = PRIORITY_STYLES[priority].dot
                    return (
                      <button
                        key={n.id}
                        onClick={() => handleClick(n)}
                        className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors
                          hover:dark:bg-white/[0.03] hover:light:bg-slate-50
                          ${!n.isRead ? 'dark:bg-blue-500/[0.04] light:bg-blue-50/60' : ''}`}
                      >
                        <span className="text-base flex-shrink-0 mt-0.5 select-none">
                          {TYPE_ICONS[n.type] ?? '🔔'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[12px] font-semibold leading-snug truncate ${n.isRead ? 'dark:text-slate-400 light:text-slate-500' : 'dark:text-white light:text-slate-800'}`}>
                            {n.title}
                          </p>
                          {n.message && (
                            <p className="text-[10px] dark:text-slate-500 light:text-slate-400 line-clamp-1 mt-0.5">
                              {n.message}
                            </p>
                          )}
                          <p className="text-[10px] dark:text-slate-600 light:text-slate-400 mt-0.5">
                            {formatThaiDateTime(n.createdAt)}
                          </p>
                        </div>
                        {!n.isRead && (
                          <div className={`w-2 h-2 ${dot} rounded-full flex-shrink-0 mt-1.5`} />
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block text-center py-2.5 text-[11px] font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300
                border-t border-slate-100 dark:border-white/[0.06] transition-colors"
            >
              เปิดศูนย์แจ้งเตือน →
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
