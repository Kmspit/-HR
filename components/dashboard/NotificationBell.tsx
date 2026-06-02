'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { apiJson } from '@/lib/client-api'
import { formatThaiDateTime } from '@/lib/utils'

function useNotifCount(initial: number) {
  const [count, setCount] = useState(initial)

  useEffect(() => {
    let es: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      es = new EventSource('/api/announcements/sse')
      es.addEventListener('notification', (e) => {
        const data = JSON.parse(e.data) as { count: number }
        setCount(data.count)
      })
      es.onerror = () => {
        es?.close()
        retryTimer = setTimeout(connect, 8000)
      }
    }

    connect()
    return () => {
      es?.close()
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [])

  return [count, setCount] as const
}

const TYPE_ICONS: Record<string, string> = {
  LEAVE_REQUEST: '📅', LEAVE_APPROVED: '✅', LEAVE_REJECTED: '❌',
  OUTSIDE_REQUEST: '🚗', OUTSIDE_APPROVED: '✅', OUTSIDE_REJECTED: '❌',
  REGISTER_REQUEST: '👤', ACCOUNT_APPROVED: '✅', ACCOUNT_REJECTED: '❌',
  WARNING_ISSUED: '⚠️', WEEKLY_PLAN_DUE: '⏰', WEEKLY_PLAN_APPROVED: '✅',
  ANNOUNCEMENT: '📢', DEVICE_RESET_REQUEST: '📱', SYSTEM: '🔔',
}

const TYPE_LINKS: Record<string, string> = {
  LEAVE_REQUEST: '/approvals', LEAVE_APPROVED: '/leave', LEAVE_REJECTED: '/leave',
  OUTSIDE_REQUEST: '/approvals', OUTSIDE_APPROVED: '/outside-work', OUTSIDE_REJECTED: '/outside-work',
  REGISTER_REQUEST: '/employees', ACCOUNT_APPROVED: '/profile', ACCOUNT_REJECTED: '/profile',
  WARNING_ISSUED: '/warnings', WEEKLY_PLAN_DUE: '/leave', WEEKLY_PLAN_APPROVED: '/leave',
  ANNOUNCEMENT: '/announcements', DEVICE_RESET_REQUEST: '/profile', SYSTEM: '/notifications',
}

type Notif = {
  id: string; type: string; title: string; message: string
  link: string | null; isRead: boolean; createdAt: string
}

type Props = {
  initialCount: number
}

export default function NotificationBell({ initialCount }: Props) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notif[]>([])
  const [count, setCount] = useNotifCount(initialCount)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

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
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [loaded])

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
  }, [])

  const markAllRead = useCallback(async () => {
    await apiJson('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })))
    setCount(0)
    router.refresh()
  }, [router])

  const handleClick = useCallback(
    (n: Notif) => {
      if (!n.isRead) markRead(n.id)
      const href = n.link ?? TYPE_LINKS[n.type] ?? '/notifications'
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
              rounded-full bg-blue-500 px-0.5 text-[8px] font-bold text-white leading-none"
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* backdrop for mobile */}
          <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)} />

          <div
            className="absolute right-0 top-full mt-2 w-80 z-50 overflow-hidden rounded-2xl
              border dark:border-white/10 light:border-slate-200
              dark:bg-slate-900 light:bg-white
              shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b dark:border-white/[0.06] light:border-slate-100">
              <span className="text-[13px] font-semibold dark:text-white light:text-slate-800">การแจ้งเตือน</span>
              {count > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <CheckCheck size={12} />
                  อ่านทั้งหมด
                </button>
              )}
            </div>

            {/* List */}
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
                  {items.map((n) => (
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
                        <div className="w-2 h-2 bg-blue-400 rounded-full flex-shrink-0 mt-1.5" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block text-center py-2.5 text-[11px] font-medium text-blue-400 hover:text-blue-300
                border-t dark:border-white/[0.06] light:border-slate-100 transition-colors"
            >
              ดูการแจ้งเตือนทั้งหมด →
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
