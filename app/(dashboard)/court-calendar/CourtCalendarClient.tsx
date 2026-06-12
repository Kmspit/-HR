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

type CalEvent = {
  id: string; title: string; eventType: string; startAt: string; endAt: string | null
  location: string | null; locationLat: number | null; locationLng: number | null
  courtName: string | null; caseNumber: string | null; status: string; priority: string
  department: string | null; note: string | null; attendees: string
  createdBy: { name: string }
}

const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
const THAI_DAYS   = ['อา','จ','อ','พ','พฤ','ศ','ส']
const STATUS_COLORS: Record<string, string> = {
  SCHEDULED:  'bg-blue-100 text-blue-700',
  COMPLETED:  'bg-green-100 text-green-700',
  CANCELLED:  'bg-gray-100 text-gray-500',
  MISSED:     'bg-red-100 text-red-700',
}
const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-500', NORMAL: 'bg-blue-100 text-blue-600',
  HIGH: 'bg-orange-100 text-orange-700', URGENT: 'bg-red-100 text-red-700',
}

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}

// ── Calendar grid builder ─────────────────────────────────────────────────────
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
export default function CourtCalendarClient({
  userId, userRole,
}: { userId: string; userRole: string; userName: string }) {
  const today = new Date()
  const [year, setYear]         = useState(today.getFullYear())
  const [month, setMonth]       = useState(today.getMonth())
  const [events, setEvents]     = useState<UnifiedEvent[]>([])
  const [selectedDay, setSelectedDay] = useState<string>(toDateKey(today))
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null)
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [form, setForm] = useState({
    title: '', courtName: '', caseNumber: '', startAt: '', endAt: '',
    location: '', priority: 'NORMAL', department: '', note: '', status: 'SCHEDULED',
  })

  const canWrite = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER', 'LAWYER', 'ENFORCEMENT', 'EMPLOYEE'].includes(userRole)

  const loadEvents = useCallback(async () => {
    setLoading(true)
    const start = new Date(year, month, 1).toISOString()
    const end   = new Date(year, month + 1, 0, 23, 59, 59).toISOString()
    const r = await fetch(`/api/calendar/unified?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&type=COURT`)
    if (r.ok) {
      const data = await r.json()
      // Also fetch TASK_COURT
      const r2 = await fetch(`/api/calendar/unified?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&type=TASK_COURT`)
      const d2  = r2.ok ? await r2.json() : { items: [] }
      setEvents([...data.items, ...d2.items])
    }
    setLoading(false)
  }, [year, month])

  useEffect(() => { loadEvents() }, [loadEvents])

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

  async function loadDetail(id: string) {
    if (id.startsWith('task-')) return  // task events — no CalendarEvent record
    const r = await fetch(`/api/calendar-events/${id}`)
    if (r.ok) setSelectedEvent(await r.json())
  }

  async function saveEvent() {
    setSaving(true)
    const r = await fetch('/api/calendar-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, eventType: 'COURT' }),
    })
    setSaving(false)
    if (r.ok) { setShowForm(false); setForm({ title:'', courtName:'', caseNumber:'', startAt:'', endAt:'', location:'', priority:'NORMAL', department:'', note:'', status:'SCHEDULED' }); await loadEvents() }
  }

  async function deleteEvent(id: string) {
    if (!confirm('ยืนยันลบนัดหมาย?')) return
    await fetch(`/api/calendar-events/${id}`, { method: 'DELETE' })
    setSelectedEvent(null)
    await loadEvents()
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/calendar-events/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setSelectedEvent(null)
    await loadEvents()
  }

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-4rem)] overflow-hidden bg-gray-50 dark:bg-gray-950">
      {/* ── Left: Month calendar ── */}
      <div className="w-full lg:w-[440px] flex-shrink-0 flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700">
        {/* Month nav */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400">‹</button>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{THAI_MONTHS[month]} {year + 543}</h2>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400">›</button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-800">
          {THAI_DAYS.map((d) => (
            <div key={d} className={`text-center text-xs font-medium py-2 ${d === 'อา' ? 'text-red-500' : d === 'ส' ? 'text-blue-500' : 'text-gray-500 dark:text-gray-400'}`}>{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">กำลังโหลด…</div>
          ) : (
            <div className="grid grid-cols-7">
              {grid.map((day, i) => {
                const key    = toDateKey(day)
                const isCurrentMonth = day.getMonth() === month
                const isToday  = key === toDateKey(today)
                const isSelected = key === selectedDay
                const dayEvs   = eventsByDay[key] ?? []
                const dow = day.getDay()

                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDay(key)}
                    className={`relative min-h-[56px] p-1 border-b border-r border-gray-100 dark:border-gray-800 text-left transition-colors
                      ${isSelected ? 'bg-red-50 dark:bg-red-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}
                      ${!isCurrentMonth ? 'opacity-30' : ''}`}
                  >
                    <span className={`text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full
                      ${isToday ? 'bg-red-500 text-white' : dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-gray-700 dark:text-gray-300'}`}>
                      {day.getDate()}
                    </span>
                    <div className="flex gap-0.5 flex-wrap mt-0.5">
                      {dayEvs.slice(0, 3).map((ev, ei) => (
                        <span key={ei} className="w-2 h-2 rounded-full" style={{ backgroundColor: ev.color }} />
                      ))}
                      {dayEvs.length > 3 && <span className="text-[9px] text-gray-400">+{dayEvs.length - 3}</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Create button */}
        {canWrite && (
          <div className="p-3 border-t border-gray-100 dark:border-gray-800">
            <button onClick={() => { setShowForm(true); setForm(f => ({ ...f, startAt: `${selectedDay}T09:00` })) }}
              className="w-full py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg">
              + เพิ่มนัดศาล
            </button>
          </div>
        )}
      </div>

      {/* ── Right: Day detail ── */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        {selectedEvent ? (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-md font-medium">⚖️ นัดศาล</span>
                    <span className={`text-xs px-2 py-0.5 rounded-md ${STATUS_COLORS[selectedEvent.status]}`}>{selectedEvent.status}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-md ${PRIORITY_COLORS[selectedEvent.priority]}`}>{selectedEvent.priority}</span>
                  </div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{selectedEvent.title}</h2>
                  {selectedEvent.courtName && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">🏛 {selectedEvent.courtName}</p>}
                  {selectedEvent.caseNumber && <p className="text-sm text-gray-500 dark:text-gray-400">เลขคดี: {selectedEvent.caseNumber}</p>}
                  <p className="text-sm text-gray-500 mt-1">📅 {fmtDate(selectedEvent.startAt)} {fmtTime(selectedEvent.startAt)}</p>
                  {selectedEvent.location && (
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-sm text-gray-500">📍 {selectedEvent.location}</p>
                      {selectedEvent.locationLat && selectedEvent.locationLng && (
                        <a href={`https://maps.google.com/?q=${selectedEvent.locationLat},${selectedEvent.locationLng}`}
                          target="_blank" rel="noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-700 underline">เปิด Maps</a>
                      )}
                    </div>
                  )}
                  {selectedEvent.note && <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 bg-gray-50 dark:bg-gray-800 rounded-lg p-2">{selectedEvent.note}</p>}
                </div>
                <button onClick={() => setSelectedEvent(null)} className="text-gray-400 text-xl flex-shrink-0">✕</button>
              </div>
              {canWrite && (
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
          <div className="max-w-2xl mx-auto">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              {selectedDay ? `นัดหมาย ${selectedDay}` : 'เลือกวันเพื่อดูนัดหมาย'}
              {dayEvents.length > 0 && <span className="ml-2 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">{dayEvents.length}</span>}
            </h3>
            {dayEvents.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-400">
                <p className="text-3xl mb-2">⚖️</p>
                <p className="text-sm">ไม่มีนัดศาลวันนี้</p>
              </div>
            ) : (
              <div className="space-y-3">
                {dayEvents.map((ev) => (
                  <button key={ev.id} onClick={() => { if (!ev.id.startsWith('task-')) loadDetail(ev.id) }}
                    className="w-full text-left bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:border-red-300 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="w-1 h-full min-h-[40px] rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{ev.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">⏰ {fmtTime(ev.startAt)}</p>
                        {ev.caseNumber && <p className="text-xs text-gray-400">เลขคดี: {ev.caseNumber}</p>}
                        {ev.courtName && <p className="text-xs text-gray-400">🏛 {ev.courtName}</p>}
                        {ev.location && <p className="text-xs text-gray-400">📍 {ev.location}</p>}
                        {ev.assigneeName && <p className="text-xs text-gray-400">👤 {ev.assigneeName}</p>}
                      </div>
                      <span className={`text-xs px-1.5 py-0.5 rounded-md flex-shrink-0 ${STATUS_COLORS[ev.status] ?? ''}`}>{ev.status}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Upcoming court dates */}
            {events.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">นัดศาลในเดือนนี้ ({events.length})</h3>
                <div className="space-y-1">
                  {events.slice(0, 15).map((ev) => (
                    <div key={ev.id} className="flex items-center gap-2 text-xs py-1.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
                      <span className="text-gray-500 w-20 flex-shrink-0">{fmtDate(ev.startAt)}</span>
                      <span className="text-gray-900 dark:text-gray-100 flex-1 truncate">{ev.title}</span>
                      {ev.caseNumber && <span className="text-gray-400 flex-shrink-0">[{ev.caseNumber}]</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Create Modal ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">⚖️ เพิ่มนัดศาล</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 text-xl">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ชื่อคดี / รายละเอียด *</label>
                <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm"
                  placeholder="เช่น นัดสืบพยาน คดีหมายเลข..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">เลขคดี</label>
                  <input value={form.caseNumber} onChange={(e) => setForm((f) => ({ ...f, caseNumber: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm"
                    placeholder="เช่น 1234/2567" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ศาล</label>
                  <input value={form.courtName} onChange={(e) => setForm((f) => ({ ...f, courtName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm"
                    placeholder="เช่น ศาลแพ่ง" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">วันเวลานัด *</label>
                  <input type="datetime-local" value={form.startAt} onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">สิ้นสุด</label>
                  <input type="datetime-local" value={form.endAt} onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">สถานที่</label>
                <input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm"
                  placeholder="เช่น ห้องพิจารณาที่ 3 อาคาร A" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
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
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm"
                    placeholder="เช่น LAW" />
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
                className="px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50">
                {saving ? 'กำลังบันทึก…' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
