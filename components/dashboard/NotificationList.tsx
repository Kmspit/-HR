'use client'

import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { formatThaiDateTime } from '@/lib/utils'
import { apiJson } from '@/lib/client-api'
import Link from 'next/link'
import { CheckCheck } from 'lucide-react'
import {
  resolveLink,
  TYPE_ICONS,
} from '@/lib/notification-center/constants'
import type { NotificationType } from '@prisma/client'

type Notification = {
  id: string; type: string; title: string; message: string; link: string | null
  isRead: boolean; createdAt: string; taskId?: string | null
}

// ── Icon + color maps ─────────────────────────────────────────────────────────

const TYPE_ICONS_LOCAL: Record<string, string> = {
  ...TYPE_ICONS,
  FORGOT_SCAN_REQUEST: '🔍',
  FORGOT_SCAN_APPROVED: '✅',
  FORGOT_SCAN_REJECTED: '❌',
  WEEKLY_PLAN_REJECTED: '❌',
  EXPENSE_CLAIM_SUBMITTED: '💳',
}

const TYPE_BG_READ: Record<string, string> = {
  TASK_OVERDUE:    'bg-red-900/30',
  TASK_COURT_REMINDER:       'bg-blue-900/20',
  TASK_DEADLINE_REMINDER:    'bg-amber-900/20',
  TASK_APPOINTMENT_REMINDER: 'bg-amber-900/20',
  TASK_WAITING_DOC: 'bg-yellow-900/20',
}

const TYPE_BG_UNREAD: Record<string, string> = {
  TASK_OVERDUE:    'bg-red-500/10 border-red-500/25',
  TASK_COURT_REMINDER:       'bg-blue-500/10 border-blue-500/25',
  TASK_DEADLINE_REMINDER:    'bg-amber-500/10 border-amber-500/25',
  TASK_APPOINTMENT_REMINDER: 'bg-amber-500/10 border-amber-500/25',
  TASK_WAITING_DOC: 'bg-yellow-500/10 border-yellow-500/25',
}

// ── Filter definitions ────────────────────────────────────────────────────────

type FilterId = 'all' | 'unread' | 'task' | 'court' | 'deadline'

const TASK_TYPES   = ['TASK_ASSIGNED', 'TASK_SUBMITTED', 'TASK_APPROVED', 'TASK_REVISION', 'TASK_WAITING_DOC']
const COURT_TYPES  = ['TASK_COURT_REMINDER', 'TASK_APPOINTMENT_REMINDER']
const DEADLINE_TYPES = ['TASK_DEADLINE_REMINDER', 'TASK_OVERDUE']

const FILTERS: { id: FilterId; label: string; emoji: string }[] = [
  { id: 'all',      label: 'ทั้งหมด',        emoji: '🔔' },
  { id: 'unread',   label: 'ยังไม่อ่าน',    emoji: '🔵' },
  { id: 'task',     label: 'งาน',            emoji: '📋' },
  { id: 'court',    label: 'นัดศาล/นัดหมาย', emoji: '⚖️' },
  { id: 'deadline', label: 'ใกล้ครบกำหนด',  emoji: '⏰' },
]

function matchFilter(n: Notification, filter: FilterId): boolean {
  if (filter === 'unread')   return !n.isRead
  if (filter === 'task')     return TASK_TYPES.includes(n.type)
  if (filter === 'court')    return COURT_TYPES.includes(n.type)
  if (filter === 'deadline') return DEADLINE_TYPES.includes(n.type)
  return true
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NotificationList({ notifications: initial }: { notifications: Notification[] }) {
  const [items,   setItems]  = useState(initial)
  const [loading, setLoading] = useState(false)
  const [filter,  setFilter] = useState<FilterId>('all')
  const router = useRouter()

  const filtered  = useMemo(() => items.filter((n) => matchFilter(n, filter)), [items, filter])
  const unreadCount = items.filter((n) => !n.isRead).length

  const filterCounts = useMemo(() => {
    const counts: Record<FilterId, number> = { all: items.length, unread: 0, task: 0, court: 0, deadline: 0 }
    for (const n of items) {
      if (!n.isRead) counts.unread++
      if (TASK_TYPES.includes(n.type))    counts.task++
      if (COURT_TYPES.includes(n.type))   counts.court++
      if (DEADLINE_TYPES.includes(n.type)) counts.deadline++
    }
    return counts
  }, [items])

  const markAllRead = async () => {
    setLoading(true)
    try {
      const { ok } = await apiJson('/api/notifications', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      })
      if (!ok) { toast.error('เกิดข้อผิดพลาด'); return }
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })))
      toast.success('อ่านทั้งหมดแล้ว')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally { setLoading(false) }
  }

  const markRead = async (id: string) => {
    const { ok } = await apiJson('/api/notifications', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
    })
    if (ok) setItems((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n))
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-2xl mx-auto">

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(({ id, label, emoji }) => {
          const cnt = filterCounts[id]
          return (
            <button key={id} type="button" onClick={() => setFilter(id)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-all border ${
                filter === id
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white/[0.04] dark:bg-white/[0.04] text-slate-400 dark:text-slate-400 border-white/[0.08] hover:bg-white/[0.08]'
              }`}>
              <span className="text-base leading-none">{emoji}</span>
              {label}
              {cnt > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  filter === id ? 'bg-white/20 text-white' : 'bg-slate-700 text-slate-300'
                }`}>{cnt}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Actions row */}
      {unreadCount > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-slate-400">{unreadCount} รายการที่ยังไม่ได้อ่าน</span>
          <button onClick={markAllRead} disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-white/[0.08] transition-all disabled:opacity-50">
            <CheckCheck className="w-3.5 h-3.5" />อ่านทั้งหมด
          </button>
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-slate-900/60 p-14 text-center">
          <p className="text-4xl mb-3">
            {filter === 'unread' ? '✉️' : filter === 'court' ? '⚖️' : filter === 'deadline' ? '⏰' : '🔔'}
          </p>
          <p className="text-[14px] text-slate-400">
            {filter === 'all' ? 'ไม่มีการแจ้งเตือน' : `ไม่มีการแจ้งเตือนในหมวดนี้`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => {
            const bgCls = n.isRead
              ? `border-white/[0.05] ${TYPE_BG_READ[n.type] ?? 'bg-slate-900/50'}`
              : `${TYPE_BG_UNREAD[n.type] ?? 'bg-blue-500/[0.07] border-blue-500/20'} hover:border-blue-500/40`

            return (
              <div key={n.id} onClick={() => { if (!n.isRead) markRead(n.id) }}
                className={`rounded-2xl border p-4 transition-all cursor-pointer ${bgCls}`}>
                <div className="flex items-start gap-3">
                  <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-xl ${n.isRead ? 'bg-slate-800' : 'bg-blue-500/10'}`}>
                    {TYPE_ICONS_LOCAL[n.type] ?? TYPE_ICONS[n.type as NotificationType] ?? '🔔'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 justify-between">
                      <p className={`text-[13px] font-semibold leading-snug ${n.isRead ? 'text-slate-300' : 'text-white'}`}>{n.title}</p>
                      {!n.isRead && <div className="h-2 w-2 rounded-full bg-blue-400 flex-shrink-0" />}
                    </div>
                    {n.message && (
                      <p className="mt-0.5 text-[12px] text-slate-400 line-clamp-2 leading-relaxed">{n.message}</p>
                    )}
                    <div className="mt-1.5 flex items-center gap-3">
                      <span className="text-[10px] text-slate-500">{formatThaiDateTime(n.createdAt)}</span>
                      {n.link && (
                        <Link href={resolveLink(n.type as NotificationType, n.link)} className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition-colors" onClick={(e) => e.stopPropagation()}>
                          ดูรายละเอียด →
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
