'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { formatThaiDateTime } from '@/lib/utils'
import Link from 'next/link'

type Notification = {
  id: string; type: string; title: string; message: string; link: string | null
  isRead: boolean; createdAt: string
}

const TYPE_ICONS: Record<string, string> = {
  LEAVE_REQUEST: '📅', LEAVE_APPROVED: '✅', LEAVE_REJECTED: '❌',
  OUTSIDE_REQUEST: '🚗', OUTSIDE_APPROVED: '✅', OUTSIDE_REJECTED: '❌',
  REGISTER_REQUEST: '👤', ACCOUNT_APPROVED: '✅', ACCOUNT_REJECTED: '❌',
  WARNING_ISSUED: '⚠️', WEEKLY_PLAN_DUE: '⏰', WEEKLY_PLAN_APPROVED: '✅',
  SYSTEM: '🔔',
}

export default function NotificationList({ notifications }: { notifications: Notification[] }) {
  const [items, setItems] = useState(notifications)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const markAllRead = async () => {
    setLoading(true)
    try {
      await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })))
      toast.success('อ่านทั้งหมดแล้ว')
      router.refresh()
    } catch { toast.error('เกิดข้อผิดพลาด') }
    finally { setLoading(false) }
  }

  const markRead = async (id: string) => {
    await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n))
  }

  const unreadCount = items.filter((n) => !n.isRead).length

  return (
    <div className="p-5 space-y-4">
      {unreadCount > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">{unreadCount} รายการที่ยังไม่ได้อ่าน</span>
          <button onClick={markAllRead} disabled={loading} className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10 transition-all disabled:opacity-50">
            อ่านทั้งหมด
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-slate-900 p-12 text-center">
          <p className="text-4xl mb-3">🔔</p>
          <p className="text-slate-400">ไม่มีการแจ้งเตือน</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <div
              key={n.id}
              onClick={() => { if (!n.isRead) markRead(n.id) }}
              className={`rounded-2xl border p-4 transition-all cursor-pointer ${n.isRead ? 'border-white/5 bg-slate-900/50' : 'border-blue-500/20 bg-blue-500/5 hover:border-blue-500/40'}`}
            >
              <div className="flex items-start gap-3">
                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-xl ${n.isRead ? 'bg-slate-800' : 'bg-blue-500/10'}`}>
                  {TYPE_ICONS[n.type] ?? '🔔'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 justify-between">
                    <p className={`text-sm font-semibold ${n.isRead ? 'text-slate-300' : 'text-white'}`}>{n.title}</p>
                    {!n.isRead && <div className="h-2 w-2 rounded-full bg-blue-400 flex-shrink-0" />}
                  </div>
                  {n.message && <p className="mt-0.5 text-xs text-slate-400 line-clamp-2">{n.message}</p>}
                  <div className="mt-1.5 flex items-center gap-3">
                    <span className="text-[10px] text-slate-500">{formatThaiDateTime(n.createdAt)}</span>
                    {n.link && (
                      <Link href={n.link} className="text-[10px] font-semibold text-blue-400 hover:text-blue-300" onClick={(e) => e.stopPropagation()}>
                        ดูรายละเอียด →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
