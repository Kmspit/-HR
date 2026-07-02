'use client'

import { useState, useEffect, useCallback } from 'react'
import { PAYMENT_APPT_STATUS_LABEL as STATUS_LABELS } from '@/lib/status-labels'

interface User { id: string; name: string; department: string | null; role: string }

interface Appointment {
  id: string
  appointDate: string
  agreedAmount: number
  location?: string
  note?: string
  status: string
  createdAt: string
  createdBy: User
  debtor: { id: string; debtorNumber: string; firstName: string; lastName: string; phone?: string; assignedToId?: string }
}

const STATUSES    = ['PENDING', 'KEPT', 'MISSED', 'CANCELLED']
const STATUS_COLORS: Record<string, string> = {
  PENDING:   'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  KEPT:      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  MISSED:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  CANCELLED: 'bg-gray-100 text-gray-600 dark:bg-gray-700/50 dark:text-gray-400',
}
const fmt     = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 0 })
const fmtDT   = (d: string) => new Date(d).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
const isPast  = (d: string) => new Date(d) < new Date()

export default function PaymentAppointmentsClient({ userId, userRole }: { userId: string; userRole: string }) {
  const [items,    setItems]    = useState<Appointment[]>([])
  const [total,    setTotal]    = useState(0)
  const [page,     setPage]     = useState(1)
  const [filter,   setFilter]   = useState<'all' | 'upcoming' | 'overdue'>('all')
  const [statusF,  setStatusF]  = useState('')
  const [loading,  setLoading]  = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  const loadItems = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('page', String(page))
    if (statusF)        params.set('status',   statusF)
    if (filter === 'upcoming') params.set('upcoming', 'true')
    if (filter === 'overdue')  params.set('overdue',  'true')
    const r = await fetch(`/api/payment-appointments?${params}`)
    if (r.ok) { const d = await r.json(); setItems(d.items); setTotal(d.total) }
    setLoading(false)
  }, [page, filter, statusF])

  useEffect(() => { loadItems() }, [loadItems])

  const updateStatus = async (id: string, status: string) => {
    setUpdating(id)
    const r = await fetch(`/api/payment-appointments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setUpdating(null)
    if (r.ok) loadItems()
  }

  // Stats from current items
  const stats = {
    pending:   items.filter(a => a.status === 'PENDING').length,
    kept:      items.filter(a => a.status === 'KEPT').length,
    missed:    items.filter(a => a.status === 'MISSED').length,
    overdue:   items.filter(a => a.status === 'PENDING' && isPast(a.appointDate)).length,
    totalAgreed: items.filter(a => a.status === 'PENDING').reduce((s, a) => s + a.agreedAmount, 0),
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">นัดชำระหนี้</h1>
        <p className="text-sm text-gray-500 mt-0.5">ติดตามการนัดชำระหนี้ทั้งหมด</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-yellow-200 dark:border-yellow-900/30 p-3 text-center">
          <p className="text-xl font-bold text-yellow-600">{stats.pending}</p>
          <p className="text-xs text-gray-500">รอชำระ</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-red-200 dark:border-red-900/30 p-3 text-center">
          <p className="text-xl font-bold text-red-600">{stats.overdue}</p>
          <p className="text-xs text-gray-500">ผิดนัดค้าง</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-green-200 dark:border-green-900/30 p-3 text-center">
          <p className="text-xl font-bold text-green-600">{stats.kept}</p>
          <p className="text-xs text-gray-500">ชำระแล้ว</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-center">
          <p className="text-xl font-bold text-gray-600">{stats.missed}</p>
          <p className="text-xs text-gray-500">ผิดนัด</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-green-200 dark:border-green-900/30 p-3 text-center">
          <p className="text-sm font-bold text-green-600">฿{fmt(stats.totalAgreed)}</p>
          <p className="text-xs text-gray-500">ยอดรออยู่</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="flex border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          {(['all', 'upcoming', 'overdue'] as const).map(f => (
            <button key={f} onClick={() => { setFilter(f); setPage(1) }} className={`px-3 py-2 text-sm transition-colors ${filter === f ? 'bg-green-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
              {{ all: 'ทั้งหมด', upcoming: 'กำลังจะถึง', overdue: 'เลยกำหนด' }[f]}
            </button>
          ))}
        </div>
        <select value={statusF} onChange={e => { setStatusF(e.target.value); setPage(1) }} className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
          <option value="">ทุกสถานะ</option>
          {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">กำลังโหลด…</div>
        ) : items.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">ไม่มีนัดชำระ</div>
        ) : items.map(appt => {
          const past    = isPast(appt.appointDate)
          const pending = appt.status === 'PENDING'
          const overdue = pending && past

          return (
            <div key={appt.id} className={`bg-white dark:bg-gray-800 rounded-xl border p-4 transition-all ${overdue ? 'border-red-300 dark:border-red-700' : 'border-gray-200 dark:border-gray-700'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {overdue && <p className="text-xs text-red-600 font-medium mb-1">⚠️ เลยกำหนดแล้ว</p>}
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{fmtDT(appt.appointDate)}</span>
                    <span className={`text-[12px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[appt.status]}`}>{STATUS_LABELS[appt.status]}</span>
                  </div>
                  <p className="text-sm font-semibold text-green-600">฿{fmt(appt.agreedAmount)}</p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <a href="/debtors" className="text-sm text-green-600 hover:underline font-medium">
                      {appt.debtor.firstName} {appt.debtor.lastName}
                    </a>
                    <span className="text-xs text-gray-400 font-mono">{appt.debtor.debtorNumber}</span>
                    {appt.debtor.phone && <span className="text-xs text-gray-400">📱 {appt.debtor.phone}</span>}
                  </div>
                  {appt.location && <p className="text-xs text-gray-500 mt-1">📍 {appt.location}</p>}
                  {appt.note     && <p className="text-xs text-gray-400 mt-0.5">{appt.note}</p>}
                  <p className="text-xs text-gray-400 mt-1">สร้างโดย: {appt.createdBy.name}</p>
                </div>

                {/* Actions */}
                {pending && (
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => updateStatus(appt.id, 'KEPT')}
                      disabled={updating === appt.id}
                      className="text-xs px-3 py-1.5 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg font-medium disabled:opacity-50"
                    >
                      {updating === appt.id ? '…' : '✓ ชำระแล้ว'}
                    </button>
                    <button
                      onClick={() => updateStatus(appt.id, 'MISSED')}
                      disabled={updating === appt.id}
                      className="text-xs px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-medium disabled:opacity-50"
                    >
                      ✗ ผิดนัด
                    </button>
                    <button
                      onClick={() => updateStatus(appt.id, 'CANCELLED')}
                      disabled={updating === appt.id}
                      className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg disabled:opacity-50"
                    >
                      ยกเลิก
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      {total > 50 && (
        <div className="flex items-center justify-between text-xs text-gray-500 mt-3">
          <span>ทั้งหมด {total} รายการ</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded border disabled:opacity-40">‹ ก่อนหน้า</button>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 50)} className="px-3 py-1 rounded border disabled:opacity-40">ถัดไป ›</button>
          </div>
        </div>
      )}
    </div>
  )
}
