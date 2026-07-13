'use client'

import { useState, useEffect, useCallback } from 'react'

type CourtType       = 'CIVIL' | 'CRIMINAL' | 'BANKRUPTCY' | 'EXECUTION' | 'LABOR' | 'ADMINISTRATIVE' | 'OTHER'
type AppointmentType = 'HEARING' | 'MEDIATION' | 'FILING' | 'WITNESS' | 'JUDGEMENT' | 'ENFORCEMENT' | 'NEGOTIATION' | 'OTHER'
type EventStatus     = 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'MISSED' | 'CANCELLED' | 'RESCHEDULED'
type CourtPriority   = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'

interface CourtEvent {
  id: string
  caseId: string
  courtName: string
  courtType: CourtType
  appointmentType: AppointmentType
  appointmentDate: string
  appointmentTime: string | null
  location: string | null
  judgeName: string | null
  roomNumber: string | null
  appointmentNumber: string | null
  status: EventStatus
  priority: CourtPriority
  assignedLawyerId: string | null
  note: string | null
  createdAt: string
  assignedLawyer: { id: string; name: string } | null
  createdBy: { id: string; name: string }
}

const COURT_TYPE_LABELS: Record<CourtType, string> = {
  CIVIL: 'แพ่ง', CRIMINAL: 'อาญา', BANKRUPTCY: 'ล้มละลาย',
  EXECUTION: 'บังคับคดี', LABOR: 'แรงงาน', ADMINISTRATIVE: 'ปกครอง', OTHER: 'อื่น ๆ',
}

const APPT_TYPE_LABELS: Record<AppointmentType, string> = {
  HEARING: 'สืบพยาน', MEDIATION: 'ไกล่เกลี่ย', FILING: 'ยื่นเอกสาร',
  WITNESS: 'พยาน', JUDGEMENT: 'พิพากษา', ENFORCEMENT: 'บังคับคดี',
  NEGOTIATION: 'เจรจา', OTHER: 'อื่น ๆ',
}

const STATUS_LABELS: Record<EventStatus, string> = {
  SCHEDULED: 'นัดหมาย', CONFIRMED: 'ยืนยัน', COMPLETED: 'เสร็จสิ้น',
  MISSED: 'พลาดนัด', CANCELLED: 'ยกเลิก', RESCHEDULED: 'นัดใหม่',
}

const STATUS_COLORS: Record<EventStatus, string> = {
  SCHEDULED:    'bg-green-100 text-green-700',
  CONFIRMED:    'bg-green-100 text-green-700',
  COMPLETED:    'bg-slate-100 text-slate-600',
  MISSED:       'bg-red-100 text-red-700',
  CANCELLED:    'bg-slate-100 text-slate-500',
  RESCHEDULED:  'bg-yellow-100 text-yellow-700',
}

const PRIORITY_COLORS: Record<CourtPriority, string> = {
  LOW:      'bg-slate-100 text-slate-500',
  NORMAL:   'bg-green-50 text-green-600',
  HIGH:     'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
}
function fmtDateTime(s: string) {
  return new Date(s).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const EMPTY_FORM = {
  courtName: '', courtType: 'CIVIL' as CourtType, appointmentType: 'HEARING' as AppointmentType,
  appointmentDate: '', appointmentTime: '', location: '',
  judgeName: '', roomNumber: '', appointmentNumber: '',
  priority: 'NORMAL' as CourtPriority, note: '',
}

export default function CourtEventsTab({ caseId, canEdit }: { caseId: string; canEdit: boolean }) {
  const [events,    setEvents]    = useState<CourtEvent[]>([])
  const [loading,   setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing,   setEditing]   = useState<CourtEvent | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/court-events?caseId=${caseId}&limit=100`)
    if (res.ok) {
      const data = await res.json()
      setEvents(data.events ?? [])
    }
    setLoading(false)
  }, [caseId])

  useEffect(() => { load() }, [load])

  function openAdd()             { setEditing(null); setShowModal(true) }
  function openEdit(e: CourtEvent) { setEditing(e);   setShowModal(true) }

  async function handleDelete(id: string) {
    if (!confirm('ลบนัดศาลนี้?')) return
    await fetch(`/api/court-events/${id}`, { method: 'DELETE' })
    await load()
  }

  async function handleStatus(id: string, status: EventStatus) {
    await fetch(`/api/court-events/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    await load()
  }

  const now       = new Date()
  const upcoming  = events.filter(e => new Date(e.appointmentDate) >= now && !['COMPLETED','MISSED','CANCELLED'].includes(e.status))
  const past      = events.filter(e => new Date(e.appointmentDate) < now  || ['COMPLETED','MISSED','CANCELLED'].includes(e.status))
  const missedEvs = events.filter(e => e.status === 'MISSED')

  if (loading) return <p className="text-[13px] text-slate-400 py-4">กำลังโหลด...</p>

  return (
    <div className="space-y-4">
      {canEdit && (
        <button onClick={openAdd} className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-3 py-2 text-[13px] font-semibold text-white hover:bg-purple-500 transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          เพิ่มนัดศาล
        </button>
      )}

      {missedEvs.length > 0 && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
          <p className="text-[13px] font-semibold text-red-700 dark:text-red-400 mb-2">⚠️ พลาดนัด ({missedEvs.length})</p>
          {missedEvs.map(e => (
            <p key={e.id} className="text-[12px] text-red-600">{APPT_TYPE_LABELS[e.appointmentType]} — {e.courtName} · {fmtDate(e.appointmentDate)}</p>
          ))}
        </div>
      )}

      {/* Upcoming */}
      <section>
        <p className="text-[12px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">นัดหมายที่จะมาถึง ({upcoming.length})</p>
        {upcoming.length === 0 ? (
          <p className="text-[13px] text-slate-400">ไม่มีนัดหมาย</p>
        ) : upcoming.map(e => <CourtCard key={e.id} event={e} canEdit={canEdit} onEdit={openEdit} onDelete={handleDelete} onStatus={handleStatus} />)}
      </section>

      {/* Past */}
      {past.length > 0 && (
        <section>
          <p className="text-[12px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 mt-4">ประวัตินัดหมาย ({past.length})</p>
          {past.map(e => <CourtCard key={e.id} event={e} canEdit={canEdit} onEdit={openEdit} onDelete={handleDelete} onStatus={handleStatus} />)}
        </section>
      )}

      {events.length === 0 && <p className="text-[13px] text-slate-400">ยังไม่มีนัดศาล</p>}

      {showModal && (
        <CourtEventModal
          caseId={caseId}
          editing={editing}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }}
        />
      )}
    </div>
  )
}

function CourtCard({ event: e, canEdit, onEdit, onDelete, onStatus }: {
  event: CourtEvent
  canEdit: boolean
  onEdit: (e: CourtEvent) => void
  onDelete: (id: string) => void
  onStatus: (id: string, s: EventStatus) => void
}) {
  const daysUntil = Math.ceil((new Date(e.appointmentDate).getTime() - Date.now()) / 86400000)
  const isUpcoming = daysUntil >= 0 && !['COMPLETED','MISSED','CANCELLED'].includes(e.status)

  return (
    <div className={`rounded-2xl bg-white dark:bg-slate-900/60 border shadow-sm p-4 mb-3 ${
      e.status === 'MISSED' ? 'border-red-300 dark:border-red-800' :
      isUpcoming && daysUntil <= 3 ? 'border-orange-300 dark:border-orange-800' :
      'border-slate-200 dark:border-white/[0.07]'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-slate-900 dark:text-white text-[14px]">⚖️ {e.courtName}</p>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[e.status]}`}>{STATUS_LABELS[e.status]}</span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${PRIORITY_COLORS[e.priority]}`}>{e.priority}</span>
            {isUpcoming && daysUntil <= 7 && (
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${daysUntil <= 1 ? 'bg-red-100 text-red-700' : daysUntil <= 3 ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {daysUntil === 0 ? 'วันนี้!' : daysUntil === 1 ? 'พรุ่งนี้' : `อีก ${daysUntil} วัน`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-[12px] text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{COURT_TYPE_LABELS[e.courtType]}</span>
            <span className="text-[12px] text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{APPT_TYPE_LABELS[e.appointmentType]}</span>
          </div>
          <p className="text-[13px] text-slate-700 dark:text-slate-300 mt-1.5">
            {fmtDate(e.appointmentDate)}{e.appointmentTime ? ` เวลา ${e.appointmentTime}` : ''}
          </p>
          {e.location && (
            <p className="text-[12px] text-slate-400 mt-0.5 flex items-center gap-1">
              📍 {e.location}
              <a href={`https://maps.google.com/?q=${encodeURIComponent(e.location)}`} target="_blank" rel="noopener noreferrer" className="text-green-500 underline text-[11px]">แผนที่</a>
            </p>
          )}
          {e.roomNumber        && <p className="text-[12px] text-slate-400 mt-0.5">ห้อง: {e.roomNumber}</p>}
          {e.appointmentNumber && <p className="text-[12px] text-slate-400 mt-0.5">หมายเลขนัด: {e.appointmentNumber}</p>}
          {e.judgeName         && <p className="text-[12px] text-slate-400 mt-0.5">ผู้พิพากษา: {e.judgeName}</p>}
          {e.note              && <p className="text-[12px] text-slate-400 mt-1 whitespace-pre-wrap">{e.note}</p>}
          <p className="text-[11px] text-slate-400 mt-2">
            เพิ่มโดย: {e.createdBy.name}
            {e.assignedLawyer && ` · ทนายที่รับผิดชอบ: ${e.assignedLawyer.name}`}
            {' · '}{fmtDateTime(e.createdAt)}
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-col gap-1">
            <button onClick={() => onEdit(e)} className="h-7 w-7 flex items-center justify-center rounded-lg text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors" title="แก้ไข">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            </button>
            <button onClick={() => onDelete(e.id)} className="h-7 w-7 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="ลบ">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </div>
        )}
      </div>
      {canEdit && !['COMPLETED','MISSED','CANCELLED'].includes(e.status) && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-white/[0.05] flex-wrap">
          <button onClick={() => onStatus(e.id, 'COMPLETED')} className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors">ทำเครื่องหมายเสร็จ</button>
          <button onClick={() => onStatus(e.id, 'MISSED')}    className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 transition-colors">พลาดนัด</button>
          <button onClick={() => onStatus(e.id, 'RESCHEDULED')} className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-yellow-50 text-yellow-700 hover:bg-yellow-100 transition-colors">นัดใหม่</button>
          {e.status === 'SCHEDULED' && (
            <button onClick={() => onStatus(e.id, 'CONFIRMED')} className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors">ยืนยันนัด</button>
          )}
        </div>
      )}
    </div>
  )
}

function CourtEventModal({ caseId, editing, onClose, onSaved }: {
  caseId: string
  editing: CourtEvent | null
  onClose: () => void
  onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const [form,   setForm]   = useState(() => editing ? {
    courtName:         editing.courtName,
    courtType:         editing.courtType,
    appointmentType:   editing.appointmentType,
    appointmentDate:   editing.appointmentDate.slice(0, 10),
    appointmentTime:   editing.appointmentTime ?? '',
    location:          editing.location ?? '',
    judgeName:         editing.judgeName ?? '',
    roomNumber:        editing.roomNumber ?? '',
    appointmentNumber: editing.appointmentNumber ?? '',
    priority:          editing.priority,
    note:              editing.note ?? '',
  } : { ...EMPTY_FORM })

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) { setForm(p => ({ ...p, [k]: v })) }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.courtName.trim() || !form.appointmentDate) {
      setError('กรุณาระบุชื่อศาลและวันนัด'); return
    }
    setSaving(true); setError('')

    const payload = {
      caseId,
      courtName:         form.courtName.trim(),
      courtType:         form.courtType,
      appointmentType:   form.appointmentType,
      appointmentDate:   new Date(form.appointmentDate).toISOString(),
      appointmentTime:   form.appointmentTime || null,
      location:          form.location || null,
      judgeName:         form.judgeName || null,
      roomNumber:        form.roomNumber || null,
      appointmentNumber: form.appointmentNumber || null,
      priority:          form.priority,
      note:              form.note || null,
    }

    const url    = editing ? `/api/court-events/${editing.id}` : '/api/court-events'
    const method = editing ? 'PATCH' : 'POST'
    const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const d      = await res.json()
    if (!res.ok) { setError(d.error ?? 'เกิดข้อผิดพลาด'); setSaving(false); return }
    onSaved()
  }

  const inputCls = 'w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-purple-500'

  return (
    <div className="fixed inset-0 z-60 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/50 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full md:max-w-lg bg-white dark:bg-slate-900 rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-white/[0.06] sticky top-0 bg-white dark:bg-slate-900 z-10">
          <h2 className="font-bold text-slate-900 dark:text-white">{editing ? 'แก้ไขนัดศาล' : 'เพิ่มนัดศาล'}</h2>
          <button type="button" onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <div>
            <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">ชื่อศาล <span className="text-red-500">*</span></label>
            <input value={form.courtName} onChange={e => set('courtName', e.target.value)} required className={inputCls} placeholder="เช่น ศาลแพ่งกรุงเทพใต้" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">ประเภทศาล</label>
              <select value={form.courtType} onChange={e => set('courtType', e.target.value as CourtType)} className={inputCls}>
                {(Object.entries(COURT_TYPE_LABELS) as [CourtType, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">ประเภทนัด</label>
              <select value={form.appointmentType} onChange={e => set('appointmentType', e.target.value as AppointmentType)} className={inputCls}>
                {(Object.entries(APPT_TYPE_LABELS) as [AppointmentType, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">วันนัด <span className="text-red-500">*</span></label>
              <input type="date" value={form.appointmentDate} onChange={e => set('appointmentDate', e.target.value)} required className={inputCls} />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">เวลา</label>
              <input type="time" value={form.appointmentTime} onChange={e => set('appointmentTime', e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">ความสำคัญ</label>
            <select value={form.priority} onChange={e => set('priority', e.target.value as CourtPriority)} className={inputCls}>
              <option value="LOW">ต่ำ</option>
              <option value="NORMAL">ปกติ</option>
              <option value="HIGH">สูง</option>
              <option value="CRITICAL">วิกฤต</option>
            </select>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">สถานที่</label>
            <input value={form.location} onChange={e => set('location', e.target.value)} className={inputCls} placeholder="ที่อยู่หรือ Google Maps" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">ห้องพิจารณา</label>
              <input value={form.roomNumber} onChange={e => set('roomNumber', e.target.value)} className={inputCls} placeholder="เช่น 803" />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">หมายเลขนัด</label>
              <input value={form.appointmentNumber} onChange={e => set('appointmentNumber', e.target.value)} className={inputCls} placeholder="เช่น 15/2567" />
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">ผู้พิพากษา</label>
            <input value={form.judgeName} onChange={e => set('judgeName', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">หมายเหตุ</label>
            <textarea value={form.note} onChange={e => set('note', e.target.value)} rows={2} className={`${inputCls} resize-none`} />
          </div>
          {error && <p className="text-[13px] text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 dark:border-white/10 py-2.5 text-[14px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04]">ยกเลิก</button>
            <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-purple-600 py-2.5 text-[14px] font-semibold text-white hover:bg-purple-500 disabled:opacity-60">
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
