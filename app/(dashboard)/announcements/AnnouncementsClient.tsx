'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { apiJson } from '@/lib/client-api'
import type { Role } from '@prisma/client'

type Notif = {
  id: string
  title: string
  message: string
  type: string
  isRead: boolean
  createdAt: Date
}

const TYPE_CONFIG: Record<string, { label: string; gradient: string; icon: string }> = {
  LEAVE_APPROVED:  { label: 'ลาอนุมัติ',    gradient: 'linear-gradient(135deg,#22c55e,#16a34a)', icon: '✅' },
  LEAVE_REJECTED:  { label: 'ลาปฏิเสธ',     gradient: 'linear-gradient(135deg,#ef4444,#dc2626)', icon: '❌' },
  WARNING_ISSUED:  { label: 'ใบเตือน',       gradient: 'linear-gradient(135deg,#f59e0b,#d97706)', icon: '⚠️' },
  PAYROLL_READY:   { label: 'เงินเดือน',     gradient: 'linear-gradient(135deg,#10b981,#059669)', icon: '💰' },
  OUTSIDE_APPROVED:{ label: 'ออกนอก อนุมัติ',gradient: 'linear-gradient(135deg,#6366f1,#4f46e5)', icon: '🚗' },
  GENERAL:         { label: 'ประกาศทั่วไป',  gradient: 'linear-gradient(135deg,#3b82f6,#2563eb)', icon: '📢' },
}

const SAMPLE_ANNOUNCEMENTS = [
  { id: 'a1', title: 'เงินเดือนเดือน พ.ค. จะโอนวันที่ 30', body: 'HR แจ้งว่าเงินเดือนประจำเดือนพฤษภาคม 2569 จะโอนเข้าบัญชีในวันที่ 30 พฤษภาคม 2569 ก่อน 12:00 น.', date: '24 พ.ค. 2569', read: 218, total: 248, type: 'PAYROLL_READY' },
  { id: 'a2', title: 'วันหยุดพิเศษ 2 มิถุนายน 2569', body: 'บริษัทกำหนดให้วันที่ 2 มิถุนายน 2569 เป็นวันหยุดพิเศษ กรุณาวางแผนงานล่วงหน้า', date: '20 พ.ค. 2569', read: 234, total: 248, type: 'GENERAL' },
  { id: 'a3', title: 'อัปเดตนโยบายการแต่งกาย', body: 'บริษัทได้ปรับปรุงนโยบายการแต่งกายในสถานที่ทำงาน ให้มีความยืดหยุ่นมากขึ้นในวันศุกร์ กรุณาอ่านรายละเอียดในกฎบริษัท', date: '18 พ.ค. 2569', read: 198, total: 248, type: 'GENERAL' },
]

export default function AnnouncementsClient({
  notifications, role, userId,
}: {
  notifications: Notif[]
  role: Role
  userId: string
}) {
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [items, setItems] = useState(notifications)

  const isHR = role === 'MANAGER_HR' || role === 'ADMIN'

  const markAllRead = async () => {
    try {
      const { ok } = await apiJson('/api/notifications/read-all', { method: 'POST' })
      if (!ok) { toast.error('เกิดข้อผิดพลาด'); return }
      setItems(prev => prev.map(n => ({ ...n, isRead: true })))
      toast.success('อ่านทั้งหมดแล้ว')
    } catch (err) {
      console.error('[announcements]', err)
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    }
  }

  const unreadCount = items.filter(n => !n.isRead).length
  const displayed = filter === 'unread' ? items.filter(n => !n.isRead) : items

  return (
    <div className="p-4 md:p-5 space-y-5">
      {/* Company Announcements */}
      <div className="rounded-2xl p-4 md:p-5"
        style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-white text-[15px]">ประกาศจากบริษัท</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">ข้อมูลสำคัญ</p>
          </div>
          {isHR && (
            <button className="btn-primary text-xs py-1.5 px-3">
              + ส่งประกาศ
            </button>
          )}
        </div>
        <div className="space-y-3">
          {SAMPLE_ANNOUNCEMENTS.map((ann) => {
            const cfg = TYPE_CONFIG[ann.type] ?? TYPE_CONFIG.GENERAL
            return (
              <div key={ann.id}
                className="group rounded-xl p-4 border transition-all"
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-base"
                    style={{ background: cfg.gradient }}>
                    {cfg.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-[13px] font-semibold text-white leading-tight">{ann.title}</h3>
                      <span className="text-[10px] text-slate-500 whitespace-nowrap">{ann.date}</span>
                    </div>
                    <p className="mt-1 text-[12px] text-slate-400 leading-relaxed line-clamp-2">{ann.body}</p>
                    {isHR && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <div className="h-1 flex-1 rounded-full bg-white/[0.06] overflow-hidden">
                          <div className="h-full rounded-full bg-blue-500/60" style={{ width: `${(ann.read/ann.total)*100}%` }} />
                        </div>
                        <span className="text-[10px] text-slate-500">อ่านแล้ว {ann.read}/{ann.total}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Personal Notifications */}
      <div className="rounded-2xl p-4 md:p-5"
        style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-white text-[15px]">การแจ้งเตือนของฉัน</h2>
            {unreadCount > 0 && (
              <p className="text-[11px] text-blue-400 mt-0.5">ยังไม่อ่าน {unreadCount} รายการ</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Filter tabs */}
            <div className="flex rounded-xl border border-white/10 overflow-hidden">
              {(['all', 'unread'] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 text-xs transition-all ${filter === f ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                  {f === 'all' ? 'ทั้งหมด' : `ยังไม่อ่าน${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
                </button>
              ))}
            </div>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                อ่านทั้งหมด
              </button>
            )}
          </div>
        </div>

        {displayed.length === 0 ? (
          <div className="flex flex-col items-center py-10 gap-3 text-slate-600">
            <svg className="h-12 w-12 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <p className="text-sm">ไม่มีการแจ้งเตือน</p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayed.map((n) => {
              const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.GENERAL
              return (
                <div key={n.id}
                  className={`flex items-start gap-3 rounded-xl px-3.5 py-3 border transition-all ${
                    n.isRead
                      ? 'border-white/[0.04] bg-transparent'
                      : 'border-blue-500/20 bg-blue-500/[0.04]'
                  }`}
                >
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-sm"
                    style={{ background: cfg.gradient }}>
                    {cfg.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-[13px] font-semibold leading-tight ${n.isRead ? 'text-slate-300' : 'text-white'}`}>
                        {n.title}
                      </p>
                      {!n.isRead && <span className="h-2 w-2 rounded-full bg-blue-400 flex-shrink-0 mt-1" />}
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500 line-clamp-2">{n.message}</p>
                    <p className="mt-1 text-[10px] text-slate-600">
                      {new Date(n.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
