'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────
type UnifiedEvent = {
  id: string; source: string; eventType: string
  title: string; startAt: string; endAt: string | null
  location: string | null; status: string; priority: string
  caseNumber: string | null; courtName: string | null
  clientName: string | null; debtorName: string | null
  assigneeName: string | null; note: string | null
  color: string
}

type SummaryData = {
  todayEvents: number; todayPayments: number; courtIn7: number; courtIn30: number
  missedEvents: number
  upcomingEvents: { id: string; title: string; startAt: string; eventType: string }[]
  byType: { eventType: string; count: number }[]
}

const EVENT_TYPES = [
  { value: 'ALL',      label: 'ทั้งหมด',    color: '#6b7280', icon: '📅' },
  { value: 'COURT',    label: 'นัดศาล',     color: '#ef4444', icon: '⚖️' },
  { value: 'CLIENT',   label: 'นัดลูกค้า',  color: '#3b82f6', icon: '🤝' },
  { value: 'DEBTOR',   label: 'นัดลูกหนี้', color: '#f97316', icon: '💰' },
  { value: 'INTERNAL', label: 'ภายใน',      color: '#22c55e', icon: '🏢' },
]

const ALL_TYPES_SET = ['COURT','CLIENT','DEBTOR','INTERNAL','TASK_COURT','TASK_APPT','PAYMENT']

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-700', COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-500', MISSED: 'bg-red-100 text-red-700',
  PENDING:   'bg-yellow-100 text-yellow-700', KEPT: 'bg-green-100 text-green-700',
}
const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-500', NORMAL: 'bg-blue-100 text-blue-600',
  HIGH: 'bg-orange-100 text-orange-700', URGENT: 'bg-red-100 text-red-700',
}

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
const THAI_DAYS_SHORT = ['อา','จ','อ','พ','พฤ','ศ','ส']

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}
function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${(d.getFullYear() + 543).toString().slice(2)}`
}

function buildGrid(year: number, month: number): Date[] {
  const firstDow = new Date(year, month, 1).getDay()
  const lastDate = new Date(year, month + 1, 0).getDate()
  const days: Date[] = []
  for (let i = firstDow - 1; i >= 0; i--) days.push(new Date(year, month, -i))
  for (let d = 1; d <= lastDate; d++) days.push(new Date(year, month, d))
  while (days.length % 7 !== 0) days.push(new Date(year, month + 1, days.length - firstDow - lastDate + 1))
  return days
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function AppointmentsClient({
  userId, userRole,
}: { userId: string; userRole: string; userName: string }) {
  const today = new Date()
  const [year, setYear]           = useState(today.getFullYear())
  const [month, setMonth]         = useState(today.getMonth())
  const [typeFilter, setType]     = useState('ALL')
  const [events, setEvents]       = useState<UnifiedEvent[]>([])
  const [selectedDay, setSelectedDay] = useState<string>(toDateKey(today))
  const [selectedEvent, setSelected]  = useState<UnifiedEvent | null>(null)
  const [loading, setLoading]     = useState(true)
  const [summary, setSummary]     = useState<SummaryData | null>(null)
  const [showForm, setShowForm]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [view, setView]           = useState<'calendar' | 'agenda'>('calendar')

  const [form, setForm] = useState({
    title: '', eventType: 'CLIENT', startAt: '', endAt: '',
    location: '', locationLat: '', locationLng: '',
    courtName: '', caseNumber: '', clientName: '', debtorName: '',
    debtAmount: '', priority: 'NORMAL', department: '', note: '',
  })

  const isAdmin = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN'].includes(userRole)
  const isCeo   = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR'].includes(userRole)

  const loadEvents = useCallback(async () => {
    setLoading(true)
    const start = new Date(year, month, 1).toISOString()
    const end   = new Date(year, month + 1, 0, 23, 59, 59).toISOString()
    const r = await fetch(`/api/calendar/unified?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&type=${typeFilter}`)
    if (r.ok) { const data = await r.json(); setEvents(data.items ?? []) }
    setLoading(false)
  }, [year, month, typeFilter])

  useEffect(() => { loadEvents() }, [loadEvents])

  useEffect(() => {
    fetch('/api/calendar/summary').then((r) => r.json()).then(setSummary)
  }, [])

  const grid = useMemo(() => buildGrid(year, month), [year, month])

  const eventsByDay = useMemo(() => {
    const map: Record<string, UnifiedEvent[]> = {}
    for (const ev of events) {
      const k = toDateKey(new Date(ev.startAt))
      if (!map[k]) map[k] = []
      map[k].push(ev)
    }
    return map
  }, [events])

  const dayEvents = eventsByDay[selectedDay] ?? []

  function prevMonth() { if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1) }
  function nextMonth() { if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1) }

  async function saveEvent() {
    setSaving(true)
    const r = await fetch('/api/calendar-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        locationLat: form.locationLat ? parseFloat(form.locationLat) : undefined,
        locationLng: form.locationLng ? parseFloat(form.locationLng) : undefined,
        debtAmount:  form.debtAmount  ? parseFloat(form.debtAmount)  : undefined,
      }),
    })
    setSaving(false)
    if (r.ok) {
      setShowForm(false)
      setForm({ title:'', eventType:'CLIENT', startAt:'', endAt:'', location:'', locationLat:'', locationLng:'', courtName:'', caseNumber:'', clientName:'', debtorName:'', debtAmount:'', priority:'NORMAL', department:'', note:'' })
      await loadEvents()
    }
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/calendar-events/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setSelected(null)
    await loadEvents()
  }

  async function deleteEvent(id: string) {
    if (!confirm('ยืนยันลบ?')) return
    await fetch(`/api/calendar-events/${id}`, { method: 'DELETE' })
    setSelected(null)
    await loadEvents()
  }

  const typeIcon = (t: string) => EVENT_TYPES.find((et) => et.value === t)?.icon ?? '📅'

  return (
    <div className="flex flex-col lg:flex-row md:h-[calc(100dvh-4rem)] md:overflow-hidden bg-gray-50 dark:bg-gray-950">
      {/* ── Left sidebar ── */}
      <div className="w-full lg:w-[320px] flex-shrink-0 flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
        {/* KPI strip — visible to admins */}
        {isCeo && summary && (
          <div className="grid grid-cols-2 gap-2 p-3 border-b border-gray-100 dark:border-gray-800">
            {[
              { label: 'วันนี้', value: summary.todayEvents + summary.todayPayments, color: 'text-blue-600' },
              { label: 'ศาล 7 วัน', value: summary.courtIn7, color: 'text-red-600' },
              { label: 'ค้าง', value: summary.missedEvents, color: 'text-orange-600' },
              { label: 'ศาล 30 วัน', value: summary.courtIn30, color: 'text-purple-600' },
            ].map((k) => (
              <div key={k.label} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2 text-center">
                <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
                <p className="text-xs text-gray-500">{k.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Type filter chips */}
        <div className="flex gap-1 p-2 flex-wrap border-b border-gray-100 dark:border-gray-800">
          {EVENT_TYPES.map((t) => (
            <button key={t.value} onClick={() => setType(t.value)}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                typeFilter === t.value ? 'text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}
              style={typeFilter === t.value ? { backgroundColor: t.color } : {}}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* View toggle */}
        <div className="flex border-b border-gray-100 dark:border-gray-800">
          {(['calendar', 'agenda'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                view === v ? 'text-blue-600 border-b-2 border-blue-500' : 'text-gray-500'
              }`}>
              {v === 'calendar' ? '📅 ปฏิทิน' : '📋 ตาราง'}
            </button>
          ))}
        </div>

        {/* Mini calendar */}
        {view === 'calendar' && (
          <div className="p-2">
            <div className="flex items-center justify-between mb-2">
              <button onClick={prevMonth} className="p-1 text-gray-400 hover:text-gray-600">‹</button>
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                {THAI_MONTHS[month]} {year + 543}
              </span>
              <button onClick={nextMonth} className="p-1 text-gray-400 hover:text-gray-600">›</button>
            </div>
            <div className="grid grid-cols-7 mb-1">
              {THAI_DAYS_SHORT.map((d) => (
                <div key={d} className={`text-center text-[10px] font-medium ${d === 'อา' ? 'text-red-500' : d === 'ส' ? 'text-blue-500' : 'text-gray-400'}`}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px">
              {grid.map((day, i) => {
                const key = toDateKey(day)
                const isCurrentMonth = day.getMonth() === month
                const isToday = key === toDateKey(today)
                const isSelected = key === selectedDay
                const dayEvs = eventsByDay[key] ?? []
                const dow = day.getDay()
                return (
                  <button key={key} onClick={() => setSelectedDay(key)}
                    className={`relative min-h-[32px] flex flex-col items-center py-0.5 rounded text-[11px] transition-colors
                      ${isSelected ? 'bg-blue-500 text-white' : isToday ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : ''}
                      ${!isCurrentMonth ? 'opacity-30' : ''}
                      ${!isSelected && !isToday ? (dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-gray-700 dark:text-gray-300') : ''}
                      hover:bg-gray-100 dark:hover:bg-gray-800`}>
                    <span className={`font-medium ${isSelected ? 'text-white' : ''}`}>{day.getDate()}</span>
                    {dayEvs.length > 0 && (
                      <div className="flex gap-px mt-px">
                        {dayEvs.slice(0, 3).map((ev, ei) => (
                          <span key={ei} className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : ''}`}
                            style={!isSelected ? { backgroundColor: ev.color } : {}} />
                        ))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Agenda — all events list */}
        {view === 'agenda' && (
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
            {loading ? (
              <div className="p-6 text-center text-sm text-gray-400">กำลังโหลด…</div>
            ) : events.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">ไม่มีนัดหมายในเดือนนี้</div>
            ) : events.map((ev) => (
              <button key={ev.id} onClick={() => setSelected(ev)}
                className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/60 ${selectedEvent?.id === ev.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                <div className="flex items-start gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: ev.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{ev.title}</p>
                    <p className="text-[10px] text-gray-500">{fmtDate(ev.startAt)} {fmtTime(ev.startAt)}</p>
                    {ev.assigneeName && <p className="text-[10px] text-gray-400">{ev.assigneeName}</p>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Create button */}
        <div className="p-2 border-t border-gray-100 dark:border-gray-800 mt-auto">
          <button onClick={() => { setShowForm(true); setForm(f => ({ ...f, startAt: `${selectedDay}T09:00` })) }}
            className="w-full py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
            + เพิ่มนัดหมาย
          </button>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        {selectedEvent ? (
          /* ── Event detail ── */
          <div className="max-w-3xl">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="text-sm">{typeIcon(selectedEvent.eventType)}</span>
                    <span className="text-xs px-2 py-0.5 rounded-md font-medium text-white"
                      style={{ backgroundColor: selectedEvent.color }}>
                      {EVENT_TYPES.find((t) => t.value === selectedEvent.eventType)?.label ?? selectedEvent.eventType}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-md ${STATUS_COLORS[selectedEvent.status] ?? ''}`}>{selectedEvent.status}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-md ${PRIORITY_COLORS[selectedEvent.priority] ?? ''}`}>{selectedEvent.priority}</span>
                  </div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{selectedEvent.title}</h2>

                  <div className="mt-3 space-y-1.5">
                    <p className="text-sm text-gray-600 dark:text-gray-400">📅 {fmtDate(selectedEvent.startAt)} · {fmtTime(selectedEvent.startAt)}</p>
                    {selectedEvent.endAt && <p className="text-sm text-gray-500">⏰ ถึง {fmtTime(selectedEvent.endAt)}</p>}
                    {selectedEvent.location && (
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-gray-600 dark:text-gray-400">📍 {selectedEvent.location}</p>
                        <a href={`https://maps.google.com/?q=${encodeURIComponent(selectedEvent.location ?? '')}`}
                          target="_blank" rel="noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-700 underline">เปิด Maps</a>
                      </div>
                    )}
                    {selectedEvent.caseNumber   && <p className="text-sm text-gray-500">เลขคดี: {selectedEvent.caseNumber}</p>}
                    {selectedEvent.courtName    && <p className="text-sm text-gray-500">🏛 {selectedEvent.courtName}</p>}
                    {selectedEvent.clientName   && <p className="text-sm text-gray-500">🤝 {selectedEvent.clientName}</p>}
                    {selectedEvent.debtorName   && <p className="text-sm text-gray-500">💰 {selectedEvent.debtorName}</p>}
                    {selectedEvent.assigneeName && <p className="text-sm text-gray-500">👤 {selectedEvent.assigneeName}</p>}
                    {selectedEvent.note && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg p-2 mt-2">{selectedEvent.note}</p>
                    )}
                  </div>
                </div>
                <button onClick={() => setSelected(null)} className="text-gray-400 text-xl flex-shrink-0">✕</button>
              </div>

              {/* Actions — only for CalendarEvent (not task/payment sources) */}
              {selectedEvent.source === 'event' && (
                <div className="flex gap-2 mt-4 flex-wrap">
                  {selectedEvent.status === 'SCHEDULED' && (
                    <>
                      <button onClick={() => updateStatus(selectedEvent.id, 'COMPLETED')}
                        className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded-lg">✅ เสร็จสิ้น</button>
                      <button onClick={() => updateStatus(selectedEvent.id, 'MISSED')}
                        className="px-3 py-1.5 text-xs bg-orange-500 hover:bg-orange-600 text-white rounded-lg">⚠️ พลาดนัด</button>
                      <button onClick={() => updateStatus(selectedEvent.id, 'CANCELLED')}
                        className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg">ยกเลิก</button>
                    </>
                  )}
                  <button onClick={() => deleteEvent(selectedEvent.id)}
                    className="px-3 py-1.5 text-xs border border-red-200 text-red-600 hover:bg-red-50 rounded-lg ml-auto">🗑 ลบ</button>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── Day events list ── */
          <div>
            {/* Today summary */}
            {isCeo && summary && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                {[
                  { label: 'นัดวันนี้',      value: summary.todayEvents,   color: 'text-blue-600',   bg: 'bg-blue-50 dark:bg-blue-900/10' },
                  { label: 'นัดชำระวันนี้',  value: summary.todayPayments, color: 'text-amber-600',  bg: 'bg-amber-50 dark:bg-amber-900/10' },
                  { label: 'นัดศาล 7 วัน',  value: summary.courtIn7,      color: 'text-red-600',    bg: 'bg-red-50 dark:bg-red-900/10' },
                  { label: 'ค้างดำเนินการ', value: summary.missedEvents,  color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/10' },
                ].map((k) => (
                  <div key={k.label} className={`${k.bg} rounded-xl p-3 text-center`}>
                    <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
                  </div>
                ))}
              </div>
            )}

            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              นัดหมาย {fmtDate(`${selectedDay}T00:00:00`)}
              {dayEvents.length > 0 && <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">{dayEvents.length}</span>}
            </h3>

            {dayEvents.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
                <p className="text-3xl mb-2">📅</p>
                <p className="text-sm text-gray-400">ไม่มีนัดหมายวันที่เลือก</p>
                <button onClick={() => setShowForm(true)}
                  className="mt-3 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">+ เพิ่มนัดหมาย</button>
              </div>
            ) : (
              <div className="space-y-3">
                {dayEvents.map((ev) => (
                  <button key={ev.id} onClick={() => setSelected(ev)}
                    className="w-full text-left bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-sm transition-all">
                    <div className="flex items-start gap-3">
                      <div className="w-1 min-h-[48px] rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span>{typeIcon(ev.eventType)}</span>
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{ev.title}</p>
                        </div>
                        <p className="text-xs text-gray-500">⏰ {fmtTime(ev.startAt)}{ev.endAt ? ` — ${fmtTime(ev.endAt)}` : ''}</p>
                        {ev.location && <p className="text-xs text-gray-400 mt-0.5">📍 {ev.location}</p>}
                        {ev.caseNumber && <p className="text-xs text-gray-400">เลขคดี: {ev.caseNumber}</p>}
                        {ev.clientName && <p className="text-xs text-gray-400">🤝 {ev.clientName}</p>}
                        {ev.debtorName && <p className="text-xs text-gray-400">💰 {ev.debtorName}</p>}
                        {ev.assigneeName && <p className="text-xs text-gray-400">👤 {ev.assigneeName}</p>}
                      </div>
                      <span className={`text-xs px-1.5 py-0.5 rounded-md flex-shrink-0 ${STATUS_COLORS[ev.status] ?? ''}`}>{ev.status}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Upcoming events from summary */}
            {summary && summary.upcomingEvents.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">นัดหมายที่กำลังจะมาถึง</h3>
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
                  {summary.upcomingEvents.map((ev) => {
                    const et = EVENT_TYPES.find((t) => t.value === ev.eventType)
                    return (
                      <div key={ev.id} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="text-sm">{et?.icon ?? '📅'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 dark:text-gray-100 truncate">{ev.title}</p>
                          <p className="text-xs text-gray-500">{fmtDate(ev.startAt)} {fmtTime(ev.startAt)}</p>
                        </div>
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: et?.color ?? '#6b7280' }} />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Create Modal ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90dvh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">📅 เพิ่มนัดหมาย</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 text-xl">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ประเภท</label>
                <div className="flex gap-2 flex-wrap">
                  {EVENT_TYPES.filter((t) => t.value !== 'ALL').map((t) => (
                    <button key={t.value} onClick={() => setForm((f) => ({ ...f, eventType: t.value }))}
                      className={`px-2.5 py-1 text-xs rounded-full transition-colors ${form.eventType === t.value ? 'text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}
                      style={form.eventType === t.value ? { backgroundColor: t.color } : {}}>
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">หัวข้อ *</label>
                <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm"
                  placeholder="หัวข้อนัดหมาย" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">วันเวลาเริ่ม *</label>
                  <input type="datetime-local" value={form.startAt} onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">สิ้นสุด</label>
                  <input type="datetime-local" value={form.endAt} onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm" />
                </div>
              </div>

              {/* Type-specific fields */}
              {form.eventType === 'COURT' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">เลขคดี</label>
                    <input value={form.caseNumber} onChange={(e) => setForm((f) => ({ ...f, caseNumber: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm" placeholder="1234/2567" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ศาล</label>
                    <input value={form.courtName} onChange={(e) => setForm((f) => ({ ...f, courtName: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm" placeholder="ศาลแพ่ง" />
                  </div>
                </div>
              )}
              {form.eventType === 'CLIENT' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ชื่อลูกค้า</label>
                  <input value={form.clientName} onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm" />
                </div>
              )}
              {form.eventType === 'DEBTOR' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ชื่อลูกหนี้</label>
                    <input value={form.debtorName} onChange={(e) => setForm((f) => ({ ...f, debtorName: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ยอดหนี้</label>
                    <input type="number" value={form.debtAmount} onChange={(e) => setForm((f) => ({ ...f, debtAmount: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm" />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">สถานที่</label>
                <input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm"
                  placeholder="สถานที่นัดหมาย" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ความสำคัญ</label>
                  <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm">
                    <option value="LOW">ต่ำ</option>
                    <option value="NORMAL">ปกติ</option>
                    <option value="HIGH">สูง</option>
                    <option value="URGENT">เร่งด่วน</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ฝ่าย</label>
                  <input value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm" placeholder="LAW" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">หมายเหตุ</label>
                <textarea value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  rows={2} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">ยกเลิก</button>
              <button onClick={saveEvent} disabled={saving || !form.title || !form.startAt}
                className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
                {saving ? 'กำลังบันทึก…' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
