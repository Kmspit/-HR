'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, ChevronRight, Plus, X, Loader2, RefreshCw, Search,
  AlertCircle, CheckCircle, Clock, Calendar, MapPin, User, FileText,
  ExternalLink, Filter,
} from 'lucide-react'
import { toast } from 'sonner'
import { COURT_EVENT_STATUS_LABEL as STATUS_LABEL } from '@/lib/status-labels'
import { useModalA11y } from '@/hooks/useModalA11y'
import { bangkokLocalInputToIso, bangkokDateKey } from '@/lib/datetime-bangkok'

// ── Types ──────────────────────────────────────────────────────────────────────

type EventSource = 'calendar' | 'case_court' | 'task'

interface CalEvent {
  id: string
  source: EventSource
  eventType: string
  title: string
  description: string | null
  startAt: string
  startTime: string | null
  endTime: string | null
  courtName: string | null
  caseNumber: string | null
  caseId: string | null
  courtId: string | null
  status: string
  priority: string
  assignedLawyerId: string | null
  assignedEmployeeId: string | null
  location: string | null
  googleMapsUrl: string | null
  reminderEnabled: boolean
  isEditable: boolean
  link: string | null
  allDay: boolean
  note: string | null
  judgeName: string | null
  clientName: string | null
  debtorName: string | null
  createdBy: { id: string; name: string }
  department: string | null
}

interface Summary {
  today: number
  thisWeek: number
  missed: number
  criticalUpcoming: number
  upcomingEvents: Array<{ id: string; title: string; eventType: string; startAt: string; startTime: string | null; courtName: string | null; caseNumber: string | null; priority: string }>
}

type View = 'month' | 'week' | 'agenda'
type Props = { userId: string; userName: string; role: string; department: string | null }

// ── Constants ──────────────────────────────────────────────────────────────────

const EVENT_TYPES: Record<string, string> = {
  COURT_APPOINTMENT: 'นัดศาล',
  FILING:            'ยื่นเอกสาร',
  MEDIATION:         'ไกล่เกลี่ย',
  HEARING:           'สืบพยาน',
  JUDGEMENT:         'พิพากษา',
  ENFORCEMENT:       'บังคับคดี',
  CLIENT_MEETING:    'ประชุมลูกค้า',
  LEGAL_DEADLINE:    'กำหนดส่ง',
  OTHER:             'อื่นๆ',
  INTERNAL:          'ภายใน',
}

// Color by event type
const TYPE_COLOR: Record<string, string> = {
  COURT_APPOINTMENT: 'bg-red-500',
  FILING:            'bg-green-500',
  MEDIATION:         'bg-purple-500',
  HEARING:           'bg-orange-500',
  JUDGEMENT:         'bg-rose-600',
  ENFORCEMENT:       'bg-amber-600',
  CLIENT_MEETING:    'bg-teal-500',
  LEGAL_DEADLINE:    'bg-green-600',
  OTHER:             'bg-slate-500',
  INTERNAL:          'bg-slate-400',
}

const TYPE_LIGHT: Record<string, string> = {
  COURT_APPOINTMENT: 'bg-red-500/15 text-red-400 border-red-500/20',
  FILING:            'bg-green-500/15 text-green-400 border-green-500/20',
  MEDIATION:         'bg-purple-500/15 text-purple-400 border-purple-500/20',
  HEARING:           'bg-orange-500/15 text-orange-400 border-orange-500/20',
  JUDGEMENT:         'bg-rose-500/15 text-rose-400 border-rose-500/20',
  ENFORCEMENT:       'bg-amber-500/15 text-amber-400 border-amber-500/20',
  CLIENT_MEETING:    'bg-teal-500/15 text-teal-400 border-teal-500/20',
  LEGAL_DEADLINE:    'bg-green-600/15 text-green-400 border-green-600/20',
  OTHER:             'bg-slate-500/15 text-slate-400 border-slate-500/20',
}

const STATUS_COLOR: Record<string, string> = {
  SCHEDULED:    'text-green-400',
  COMPLETED:    'text-green-400',
  MISSED:       'text-red-400',
  CANCELLED:    'text-slate-500',
  RESCHEDULED:  'text-amber-400',
}


const THAI_DAYS_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
const THAI_MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

// ── Helpers ────────────────────────────────────────────────────────────────────

// NOT d.toISOString().slice(0, 10) — that normalizes to UTC, which for Bangkok
// (UTC+7, no DST) silently rolls local-midnight-constructed dates back a day and
// mis-buckets early-morning server instants into the previous day. bangkokDateKey
// reads the date as seen from Asia/Bangkok regardless of how the Date was built.
function isoDate(d: Date) { return bangkokDateKey(d) }

function startOfWeek(d: Date) {
  const r = new Date(d)
  const day = r.getDay()
  r.setDate(r.getDate() - ((day + 6) % 7)) // Monday start
  r.setHours(0, 0, 0, 0)
  return r
}

function formatThaiDate(isoStr: string) {
  const d = new Date(isoStr)
  return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`
}

function formatTime(t: string | null) {
  return t ?? ''
}

function getEventDateKey(e: CalEvent) {
  return isoDate(new Date(e.startAt))
}

function groupByDate(events: CalEvent[]) {
  const m = new Map<string, CalEvent[]>()
  for (const e of events) {
    const k = getEventDateKey(e)
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push(e)
  }
  return m
}

function priorityDot(priority: string) {
  if (priority === 'CRITICAL') return <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block mr-1" />
  if (priority === 'HIGH') return <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block mr-1" />
  return null
}

// ── Event Dot (for month view) ─────────────────────────────────────────────────
function EventDot({ e }: { e: CalEvent }) {
  // COMPLETED (green) vs MISSED (red) is the classic colorblind confusion
  // pair — differentiate by shape too (circle vs diamond), not color alone.
  const isMissed = e.status === 'MISSED'
  return (
    <span
      role="img"
      aria-label={`${e.title} — ${e.status === 'COMPLETED' ? 'เสร็จสิ้น' : isMissed ? 'พลาดนัด' : e.eventType}`}
      className={`inline-block w-2 h-2 shrink-0 ${
        isMissed
          ? 'rotate-45 bg-red-600'
          : `rounded-full ${e.status === 'COMPLETED' ? 'bg-green-400' : (TYPE_COLOR[e.eventType] ?? 'bg-slate-400')}`
      }`}
      title={e.title}
    />
  )
}

// ── Event Pill (for week view) ─────────────────────────────────────────────────
function EventPill({ e, onClick }: { e: CalEvent; onClick: () => void }) {
  const colorBase = e.status === 'COMPLETED' ? 'bg-green-500/20 text-green-300 border-green-500/30' :
                    e.status === 'MISSED'    ? 'bg-red-500/20 text-red-300 border-red-500/30' :
                    e.status === 'CANCELLED' ? 'bg-slate-500/10 text-slate-500 border-slate-500/20 line-through' :
                    (TYPE_LIGHT[e.eventType] ?? TYPE_LIGHT.OTHER)
  return (
    <button
      onClick={onClick}
      className={`w-full text-left text-[12px] px-1.5 py-1 rounded-lg border truncate mb-0.5 transition hover:opacity-80 ${colorBase}`}
    >
      {e.startTime && <span className="font-semibold mr-1">{formatTime(e.startTime)}</span>}
      {priorityDot(e.priority)}
      {e.title}
    </button>
  )
}

// ── Month View ─────────────────────────────────────────────────────────────────

function MonthView({ anchor, events, onSelectDay, onSelectEvent, today }: {
  anchor: Date
  events: CalEvent[]
  onSelectDay: (d: Date) => void
  onSelectEvent: (e: CalEvent) => void
  today: string
}) {
  const year  = anchor.getFullYear()
  const month = anchor.getMonth()
  const firstDay = new Date(year, month, 1)
  const startCol  = (firstDay.getDay() + 6) % 7 // Monday=0
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // Build 6-week grid
  const cells: Array<{ date: Date | null }> = []
  for (let i = 0; i < startCol; i++) cells.push({ date: null })
  for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(year, month, d) })
  while (cells.length % 7 !== 0) cells.push({ date: null })

  const byDate = groupByDate(events)

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-white/[0.07]">
        {THAI_DAYS_SHORT.map(d => (
          <div key={d} className="text-center text-[11px] text-white/40 py-2 font-medium">{d}</div>
        ))}
      </div>
      {/* Cells */}
      <div className="grid grid-cols-7 flex-1 overflow-y-auto">
        {cells.map((cell, i) => {
          const dateKey = cell.date ? isoDate(cell.date) : null
          const dayEvents = dateKey ? (byDate.get(dateKey) ?? []) : []
          const isToday = dateKey === today
          return (
            <div
              key={cell.date ? isoDate(cell.date) : 'empty-' + i}
              onClick={() => cell.date && onSelectDay(cell.date)}
              className={`border-r border-b border-white/[0.04] min-h-[80px] p-1 cursor-pointer hover:bg-white/[0.03] transition ${!cell.date ? 'bg-white/[0.01]' : ''}`}
            >
              {cell.date && (
                <>
                  <div className={`text-[12px] font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-green-500 text-white' : 'text-white/60'}`}>
                    {cell.date.getDate()}
                  </div>
                  <div className="flex flex-wrap gap-0.5">
                    {dayEvents.slice(0, 3).map(e => (
                      <button
                        key={e.id}
                        onClick={(ev) => { ev.stopPropagation(); onSelectEvent(e) }}
                      >
                        <EventDot e={e} />
                      </button>
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="text-[11px] text-white/30 leading-4">+{dayEvents.length - 3}</span>
                    )}
                  </div>
                  {dayEvents.slice(0, 2).map(e => (
                    <button
                      key={e.id}
                      onClick={(ev) => { ev.stopPropagation(); onSelectEvent(e) }}
                      className="hidden md:block w-full"
                    >
                      <div className={`text-[12px] px-1 py-0.5 rounded truncate mb-0.5 text-left ${
                        e.status === 'COMPLETED' ? 'bg-green-500/15 text-green-400' :
                        e.status === 'MISSED'    ? 'bg-red-500/15 text-red-400' :
                        e.status === 'CANCELLED' ? 'bg-slate-500/10 text-slate-500 line-through' :
                        (TYPE_LIGHT[e.eventType] ?? TYPE_LIGHT.OTHER)
                      }`}>
                        {e.startTime ? `${e.startTime} ` : ''}{e.title}
                      </div>
                    </button>
                  ))}
                  {dayEvents.length > 2 && (
                    <p className="hidden md:block text-[11px] text-white/30">+{dayEvents.length - 2} เพิ่มเติม</p>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Week View ──────────────────────────────────────────────────────────────────

function WeekView({ anchor, events, onSelectEvent, onSelectDay, today }: {
  anchor: Date
  events: CalEvent[]
  onSelectEvent: (e: CalEvent) => void
  onSelectDay: (d: Date) => void
  today: string
}) {
  const monday = startOfWeek(anchor)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
  const byDate = groupByDate(events)

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-x-auto">
      <div className="grid grid-cols-7 min-w-[600px] border-b border-white/[0.07]">
        {days.map(d => {
          const dk = isoDate(d)
          const isToday = dk === today
          return (
            <div key={dk} className="text-center py-2 border-r border-white/[0.04] last:border-r-0">
              <p className={`text-[11px] font-medium ${isToday ? 'text-green-400' : 'text-white/40'}`}>
                {THAI_DAYS_SHORT[d.getDay()]}
              </p>
              <button
                onClick={() => onSelectDay(d)}
                className={`w-8 h-8 flex items-center justify-center mx-auto rounded-full text-sm font-semibold transition ${isToday ? 'bg-green-500 text-white' : 'text-white/70 hover:bg-white/10'}`}
              >
                {d.getDate()}
              </button>
            </div>
          )
        })}
      </div>
      <div className="grid grid-cols-7 min-w-[600px] flex-1 overflow-y-auto">
        {days.map(d => {
          const dk = isoDate(d)
          const dayEvents = byDate.get(dk) ?? []
          return (
            <div key={dk} className="border-r border-white/[0.04] last:border-r-0 p-1.5 min-h-[120px]">
              {dayEvents.map(e => (
                <EventPill key={e.id} e={e} onClick={() => onSelectEvent(e)} />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Agenda View ────────────────────────────────────────────────────────────────

function AgendaView({ events, onSelectEvent, today }: {
  events: CalEvent[]
  onSelectEvent: (e: CalEvent) => void
  today: string
}) {
  const byDate = groupByDate(events)
  const sortedDates = Array.from(byDate.keys()).sort()

  if (sortedDates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-white/30 gap-3">
        <Calendar className="w-12 h-12 opacity-30" />
        <p className="text-sm">ไม่มีนัดหมายในช่วงนี้</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-4 p-1">
      {sortedDates.map(dateKey => {
        const d = new Date(dateKey)
        const isToday = dateKey === today
        const dayEvents = byDate.get(dateKey)!
        return (
          <div key={dateKey}>
            <div className={`flex items-center gap-2 mb-2 ${isToday ? 'text-green-400' : 'text-white/50'}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isToday ? 'bg-green-500 text-white' : 'bg-white/5'}`}>
                {d.getDate()}
              </div>
              <span className="text-xs font-semibold">
                {THAI_DAYS_SHORT[d.getDay()]}. {d.getDate()} {THAI_MONTHS_SHORT[d.getMonth()]} {d.getFullYear() + 543}
                {isToday && <span className="ml-2 text-[12px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">วันนี้</span>}
              </span>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>
            <div className="space-y-1.5 ml-9">
              {dayEvents.map(e => (
                <button
                  key={e.id}
                  onClick={() => onSelectEvent(e)}
                  className="w-full text-left group"
                >
                  <div className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border transition hover:border-white/20 ${
                    e.status === 'COMPLETED' ? 'bg-green-500/5 border-green-500/15' :
                    e.status === 'MISSED'    ? 'bg-red-500/5 border-red-500/20' :
                    e.status === 'CANCELLED' ? 'bg-white/[0.02] border-white/[0.05] opacity-60' :
                    'bg-white/[0.03] border-white/[0.07]'
                  }`}>
                    <div className={`w-1 self-stretch rounded-full shrink-0 mt-1 ${
                      e.status === 'COMPLETED' ? 'bg-green-400' :
                      e.status === 'MISSED'    ? 'bg-red-500' :
                      e.status === 'CANCELLED' ? 'bg-slate-500' :
                      (TYPE_COLOR[e.eventType] ?? 'bg-slate-400')
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-sm font-medium ${e.status === 'CANCELLED' ? 'line-through text-white/40' : 'text-white'}`}>
                          {e.title}
                        </p>
                        <span className={`text-[12px] px-1.5 py-0.5 rounded-md border ${TYPE_LIGHT[e.eventType] ?? TYPE_LIGHT.OTHER}`}>
                          {EVENT_TYPES[e.eventType] ?? e.eventType}
                        </span>
                        {e.priority === 'CRITICAL' && (
                          <span className="text-[12px] px-1.5 py-0.5 rounded-md bg-red-500/20 text-red-400 border border-red-500/30 font-semibold">
                            วิกฤต
                          </span>
                        )}
                        {e.priority === 'HIGH' && (
                          <span className="text-[12px] px-1.5 py-0.5 rounded-md bg-orange-500/10 text-orange-400 border border-orange-500/20">
                            สูง
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[11px] text-white/40">
                        {e.startTime && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {e.startTime}{e.endTime ? `–${e.endTime}` : ''}
                          </span>
                        )}
                        {e.courtName && (
                          <span className="flex items-center gap-1">
                            <FileText className="w-3 h-3" /> {e.courtName}
                          </span>
                        )}
                        {e.caseNumber && (
                          <span className="text-green-400/70">{e.caseNumber}</span>
                        )}
                        {e.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {e.location}
                          </span>
                        )}
                        <span className={STATUS_COLOR[e.status] ?? 'text-white/40'}>
                          {STATUS_LABEL[e.status] ?? e.status}
                        </span>
                        {e.source === 'case_court' && (
                          <span className="text-[11px] bg-white/5 px-1.5 py-0.5 rounded">คดี</span>
                        )}
                        {e.source === 'task' && (
                          <span className="text-[11px] bg-white/5 px-1.5 py-0.5 rounded">งาน</span>
                        )}
                      </div>
                    </div>
                    <div className={`text-[11px] font-medium shrink-0 ${STATUS_COLOR[e.status] ?? 'text-white/40'}`}>
                      {STATUS_LABEL[e.status]}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Event Detail Panel ─────────────────────────────────────────────────────────

function EventDetail({ event, onClose, onStatusChange, canEdit }: {
  event: CalEvent
  onClose: () => void
  onStatusChange: (status: string) => void
  canEdit: boolean
}) {
  const [updating, setUpdating] = useState(false)

  async function markAs(status: string) {
    if (!event.isEditable) return
    setUpdating(true)
    try {
      await fetch(`/api/court-calendar/${event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      onStatusChange(status)
      toast.success(`อัปเดตสถานะเป็น "${STATUS_LABEL[status]}"`)
    } catch {
      toast.error('อัปเดตไม่สำเร็จ')
    } finally {
      setUpdating(false)
    }
  }

  const typeColor = TYPE_COLOR[event.eventType] ?? 'bg-slate-400'
  const typeLight = TYPE_LIGHT[event.eventType] ?? TYPE_LIGHT.OTHER

  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 space-y-4 h-full overflow-y-auto">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${typeColor}`} />
          <span className={`text-[11px] px-2 py-0.5 rounded-lg border ${typeLight}`}>
            {EVENT_TYPES[event.eventType] ?? event.eventType}
          </span>
          {event.priority === 'CRITICAL' && (
            <span className="text-[11px] px-2 py-0.5 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 font-semibold">
              ⚠ วิกฤต
            </span>
          )}
          {event.source !== 'calendar' && (
            <span className="text-[12px] bg-white/5 text-white/40 px-1.5 py-0.5 rounded-lg">
              {event.source === 'case_court' ? 'นัดจากคดี' : 'จากงาน'}
            </span>
          )}
        </div>
        <button onClick={onClose} aria-label="ปิด" className="p-1.5 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div>
        <h3 className={`text-white font-semibold text-sm leading-snug mb-1 ${event.status === 'CANCELLED' ? 'line-through text-white/40' : ''}`}>
          {event.title}
        </h3>
        <div className={`inline-flex items-center gap-1.5 text-xs font-medium ${STATUS_COLOR[event.status] ?? 'text-white/50'}`}>
          {event.status === 'COMPLETED' ? <CheckCircle className="w-3 h-3" /> : event.status === 'MISSED' ? <AlertCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
          {STATUS_LABEL[event.status] ?? event.status}
        </div>
      </div>

      <div className="space-y-2 text-[12px]">
        <div className="flex items-center gap-2 text-white/60">
          <Calendar className="w-3.5 h-3.5 shrink-0 text-white/30" />
          <span>{formatThaiDate(event.startAt)}{event.startTime ? ` เวลา ${event.startTime}` : ''}{event.endTime ? `–${event.endTime}` : ''}</span>
        </div>
        {event.courtName && (
          <div className="flex items-center gap-2 text-white/60">
            <FileText className="w-3.5 h-3.5 shrink-0 text-white/30" />
            <span>{event.courtName}</span>
          </div>
        )}
        {event.caseNumber && (
          <div className="flex items-center gap-2 text-white/60">
            <span className="text-white/30 text-xs">คดี</span>
            {event.caseId ? (
              <Link href={`/cases/${event.caseId}`} className="text-green-400 hover:text-green-300 transition hover:underline">
                {event.caseNumber}
              </Link>
            ) : (
              <span>{event.caseNumber}</span>
            )}
          </div>
        )}
        {event.location && (
          <div className="flex items-center gap-2 text-white/60">
            <MapPin className="w-3.5 h-3.5 shrink-0 text-white/30" />
            <span className="flex-1">{event.location}</span>
            {event.googleMapsUrl && (
              <a href={event.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="text-green-400 hover:text-green-300 transition">
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        )}
        {event.clientName && (
          <div className="flex items-center gap-2 text-white/60">
            <User className="w-3.5 h-3.5 shrink-0 text-white/30" />
            <span>ลูกค้า: {event.clientName}</span>
          </div>
        )}
        {event.debtorName && (
          <div className="flex items-center gap-2 text-white/60">
            <User className="w-3.5 h-3.5 shrink-0 text-white/30" />
            <span>ลูกหนี้: {event.debtorName}</span>
          </div>
        )}
        {event.description && (
          <p className="text-white/50 bg-white/5 rounded-xl px-3 py-2 text-[11px]">{event.description}</p>
        )}
        {event.note && event.note !== event.description && (
          <p className="text-white/40 text-[11px]">หมายเหตุ: {event.note}</p>
        )}
      </div>

      {/* Status actions (editable events only) */}
      {event.isEditable && event.status === 'SCHEDULED' && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => void markAs('COMPLETED')}
            disabled={updating}
            className="flex-1 py-2 rounded-xl bg-green-500/20 text-green-400 text-xs font-semibold hover:bg-green-500/30 transition disabled:opacity-40"
          >
            <CheckCircle className="w-3.5 h-3.5 inline mr-1" /> เสร็จแล้ว
          </button>
          <button
            onClick={() => void markAs('MISSED')}
            disabled={updating}
            className="flex-1 py-2 rounded-xl bg-red-500/10 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition disabled:opacity-40"
          >
            <AlertCircle className="w-3.5 h-3.5 inline mr-1" /> พลาด
          </button>
          <button
            onClick={() => void markAs('CANCELLED')}
            disabled={updating}
            className="px-3 py-2 rounded-xl bg-white/5 text-white/40 text-xs hover:bg-white/10 transition disabled:opacity-40"
          >
            ยกเลิก
          </button>
        </div>
      )}

      {event.link && (
        <Link
          href={event.link}
          className="flex items-center justify-center gap-2 w-full py-2 rounded-xl border border-white/10 text-white/50 text-xs hover:bg-white/5 hover:text-white transition"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          {event.source === 'case_court' ? 'ดูรายละเอียดคดี' : 'ดูรายละเอียด'}
        </Link>
      )}
    </div>
  )
}

// ── Add/Edit Event Modal ───────────────────────────────────────────────────────

type FormData = {
  title: string; eventType: string; startAt: string; startTime: string
  endTime: string; courtName: string; caseNumber: string; clientName: string
  debtorName: string; location: string; googleMapsUrl: string; description: string
  priority: string; status: string; reminderEnabled: boolean
}

function AddEventModal({ onClose, onSuccess, editEvent }: {
  onClose: () => void
  onSuccess: () => void
  editEvent?: CalEvent | null
}) {
  const panelRef = useModalA11y(true)
  const [form, setForm] = useState<FormData>({
    title:           editEvent?.title ?? '',
    eventType:       editEvent?.eventType ?? 'COURT_APPOINTMENT',
    // Extract the calendar date in Bangkok terms, not by naively slicing the UTC
    // ISO string — for an event stored near Bangkok midnight, the UTC date and
    // Bangkok date can differ by a day.
    startAt:         editEvent ? bangkokDateKey(new Date(editEvent.startAt)) : bangkokDateKey(),
    startTime:       editEvent?.startTime ?? '',
    endTime:         editEvent?.endTime ?? '',
    courtName:       editEvent?.courtName ?? '',
    caseNumber:      editEvent?.caseNumber ?? '',
    clientName:      editEvent?.clientName ?? '',
    debtorName:      editEvent?.debtorName ?? '',
    location:        editEvent?.location ?? '',
    googleMapsUrl:   editEvent?.googleMapsUrl ?? '',
    description:     editEvent?.description ?? '',
    priority:        editEvent?.priority ?? 'MEDIUM',
    status:          editEvent?.status ?? 'SCHEDULED',
    reminderEnabled: editEvent?.reminderEnabled ?? true,
  })
  const [saving, setSaving] = useState(false)

  function set(k: keyof FormData, v: string | boolean) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function submit() {
    if (!form.title.trim()) { toast.error('กรุณากรอกชื่อนัด'); return }
    if (!form.startAt)      { toast.error('กรุณาเลือกวันที่'); return }
    setSaving(true)
    try {
      const body = {
        title:          form.title.trim(),
        eventType:      form.eventType,
        // form.startAt/startTime are naive (no timezone) — convert to a real UTC
        // instant assuming Bangkok local time before sending, so the server's
        // `new Date(startAt)` can't misinterpret it under Vercel's default UTC.
        startAt:        bangkokLocalInputToIso(`${form.startAt}T${form.startTime || '00:00'}`),
        startTime:      form.startTime || null,
        endTime:        form.endTime || null,
        courtName:      form.courtName || null,
        caseNumber:     form.caseNumber || null,
        clientName:     form.clientName || null,
        debtorName:     form.debtorName || null,
        location:       form.location || null,
        googleMapsUrl:  form.googleMapsUrl || null,
        description:    form.description || null,
        priority:       form.priority,
        status:         form.status,
        reminderEnabled: form.reminderEnabled,
      }
      const url    = editEvent ? `/api/court-calendar/${editEvent.id}` : '/api/court-calendar'
      const method = editEvent ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error('Save failed')
      const saved = await res.json().catch(() => null) as { warnings?: { title: string; startAt: string }[] } | null
      toast.success(editEvent ? 'แก้ไขนัดสำเร็จ' : 'เพิ่มนัดสำเร็จ')
      if (saved?.warnings?.length) {
        const list = saved.warnings
          .map((w) => `${w.title} (${formatThaiDate(w.startAt)} ${new Date(w.startAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })})`)
          .join(', ')
        toast.warning(`⚠️ เวลานี้ชนกับนัดอื่น ${saved.warnings.length} รายการ: ${list}`, { duration: 8000 })
      }
      onSuccess()
      onClose()
    } catch {
      toast.error('เกิดข้อผิดพลาด')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-60 bg-black/60 flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
      <div ref={panelRef} role="dialog" aria-modal aria-label={editEvent ? 'แก้ไขนัดหมาย' : 'เพิ่มนัดหมาย'} tabIndex={-1} className="bg-slate-900 border border-white/10 rounded-t-3xl md:rounded-2xl w-full md:max-w-lg shadow-2xl overflow-y-auto max-h-[95dvh]"
        onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between">
          <h3 className="text-white font-semibold text-sm">{editEvent ? 'แก้ไขนัดหมาย' : 'เพิ่มนัดหมาย'}</h3>
          <button onClick={onClose} aria-label="ปิด" className="p-1.5 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {/* Title + type row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label htmlFor="field-1" className="text-white/50 text-xs mb-1 block">ชื่อนัดหมาย *</label>
              <input id="field-1" value={form.title} onChange={e => set('title', e.target.value)}
                placeholder="เช่น นัดสืบพยาน คดีนาย..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-green-500/50" />
            </div>
            <div>
              <label htmlFor="field-2" className="text-white/50 text-xs mb-1 block">ประเภท</label>
              <select id="field-2" value={form.eventType} onChange={e => set('eventType', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-green-500/50">
                {Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="field-3" className="text-white/50 text-xs mb-1 block">ความสำคัญ</label>
              <select id="field-3" value={form.priority} onChange={e => set('priority', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-green-500/50">
                <option value="LOW">ต่ำ</option>
                <option value="MEDIUM">ปานกลาง</option>
                <option value="HIGH">สูง</option>
                <option value="CRITICAL">วิกฤต</option>
              </select>
            </div>
          </div>

          {/* Date + time row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-3 md:col-span-1">
              <label htmlFor="field-4" className="text-white/50 text-xs mb-1 block">วันที่ *</label>
              <input id="field-4" type="date" value={form.startAt} onChange={e => set('startAt', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-green-500/50" />
            </div>
            <div>
              <label htmlFor="field-5" className="text-white/50 text-xs mb-1 block">เวลาเริ่ม</label>
              <input id="field-5" type="time" value={form.startTime} onChange={e => set('startTime', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-green-500/50" />
            </div>
            <div>
              <label htmlFor="field-6" className="text-white/50 text-xs mb-1 block">เวลาสิ้นสุด</label>
              <input id="field-6" type="time" value={form.endTime} onChange={e => set('endTime', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-green-500/50" />
            </div>
          </div>

          <input value={form.courtName} onChange={e => set('courtName', e.target.value)}
            placeholder="ชื่อศาล (ไม่บังคับ)"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-green-500/50" />

          <div className="grid grid-cols-2 gap-3">
            <input value={form.caseNumber} onChange={e => set('caseNumber', e.target.value)}
              placeholder="หมายเลขคดี"
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-green-500/50" />
            <input value={form.clientName} onChange={e => set('clientName', e.target.value)}
              placeholder="ชื่อลูกค้า/บริษัท"
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-green-500/50" />
          </div>

          <input value={form.location} onChange={e => set('location', e.target.value)}
            placeholder="สถานที่"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-green-500/50" />

          <input value={form.googleMapsUrl} onChange={e => set('googleMapsUrl', e.target.value)}
            placeholder="Google Maps URL (ไม่บังคับ)"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-green-500/50" />

          <textarea value={form.description} onChange={e => set('description', e.target.value)}
            placeholder="รายละเอียด / หมายเหตุ" rows={2}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder:text-white/30 resize-none focus:outline-none focus:border-green-500/50" />

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.reminderEnabled} onChange={e => set('reminderEnabled', e.target.checked)}
              className="w-4 h-4 rounded accent-green-500" />
            <span className="text-white/60 text-sm">เปิดการแจ้งเตือน (7 วัน / 3 วัน / 1 วัน / วันเดียวกัน)</span>
          </label>

          <div className="flex gap-2 pt-1">
            <button onClick={submit} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold disabled:opacity-40 transition">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {editEvent ? 'บันทึก' : 'เพิ่มนัด'}
            </button>
            <button onClick={onClose} disabled={saving}
              className="px-4 py-2.5 rounded-xl border border-white/10 text-white/50 hover:bg-white/5 text-sm transition disabled:opacity-40">
              ยกเลิก
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function CourtCalendarClient({ userId, userName, role, department }: Props) {
  const [view, setView]               = useState<View>('week')
  const [anchor, setAnchor]           = useState(() => new Date())
  const [events, setEvents]           = useState<CalEvent[]>([])
  const [summary, setSummary]         = useState<Summary | null>(null)
  const [loading, setLoading]         = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null)
  const mobileDetailPanelRef = useModalA11y(!!selectedEvent)
  const [showAdd, setShowAdd]         = useState(false)
  const [editEvent, setEditEvent]     = useState<CalEvent | null>(null)
  const [searchQ, setSearchQ]         = useState('')
  const [typeFilter, setTypeFilter]   = useState('')
  const [priorityFilter, setPriority] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const searchTimeout                 = useRef<ReturnType<typeof setTimeout>>(null)
  const [debouncedQ, setDebouncedQ]   = useState('')

  const today = isoDate(new Date())

  // Compute date range for current view
  function getRange() {
    if (view === 'month') {
      const y = anchor.getFullYear(); const m = anchor.getMonth()
      const from = new Date(y, m, 1)
      const to   = new Date(y, m + 1, 0, 23, 59, 59)
      return { from, to }
    }
    if (view === 'week') {
      const from = startOfWeek(anchor)
      const to   = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)
      return { from, to }
    }
    // agenda: next 30 days
    const from = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())
    const to   = new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000)
    return { from, to }
  }

  const loadEvents = useCallback(async () => {
    setLoading(true)
    try {
      const { from, to } = getRange()
      const p = new URLSearchParams({
        from: from.toISOString(),
        to:   to.toISOString(),
      })
      if (debouncedQ)    p.set('q', debouncedQ)
      if (typeFilter)    p.set('eventType', typeFilter)
      if (priorityFilter) p.set('priority', priorityFilter)
      if (statusFilter)  p.set('status', statusFilter)

      const res = await fetch(`/api/court-calendar?${p}`)
      const data = await res.json()
      setEvents(data.events ?? [])
    } catch {
      toast.error('โหลดข้อมูลไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, anchor, debouncedQ, typeFilter, priorityFilter, statusFilter])

  const loadSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/court-calendar/summary')
      const data = await res.json()
      setSummary(data)
    } catch { /* best effort */ }
  }, [])

  useEffect(() => { void loadEvents() }, [loadEvents])
  useEffect(() => { void loadSummary() }, [loadSummary])

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => setDebouncedQ(searchQ), 400)
  }, [searchQ])

  function navigate(dir: 1 | -1) {
    setAnchor(a => {
      const d = new Date(a)
      if (view === 'month') d.setMonth(d.getMonth() + dir)
      else if (view === 'week') d.setDate(d.getDate() + dir * 7)
      else d.setDate(d.getDate() + dir * 30)
      return d
    })
  }

  function currentLabel() {
    if (view === 'month') return `${THAI_MONTHS[anchor.getMonth()]} ${anchor.getFullYear() + 543}`
    if (view === 'week') {
      const mon = startOfWeek(anchor)
      const sun = new Date(mon.getTime() + 6 * 24 * 60 * 60 * 1000)
      return `${mon.getDate()} ${THAI_MONTHS_SHORT[mon.getMonth()]} – ${sun.getDate()} ${THAI_MONTHS_SHORT[sun.getMonth()]} ${sun.getFullYear() + 543}`
    }
    return `30 วันข้างหน้า`
  }

  function onSelectDay(d: Date) {
    setAnchor(d)
    if (view === 'month') setView('agenda')
  }

  function handleStatusChange(newStatus: string) {
    setEvents(es => es.map(e => e.id === selectedEvent?.id ? { ...e, status: newStatus } : e))
    setSelectedEvent(e => e ? { ...e, status: newStatus } : null)
    void loadSummary()
  }

  const canEdit = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'LAWYER', 'ENFORCEMENT', 'TEAM_LEADER'].includes(role)

  return (
    <div className="flex flex-col md:h-[calc(100dvh-56px)] md:overflow-hidden">
      {/* ── Summary Cards ───────────────────────────────── */}
      {summary && (
        <div className="px-4 pt-3 pb-2 grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
          {[
            { label: 'วันนี้',    val: summary.today,            color: 'text-green-400',   bg: 'bg-green-500/10' },
            { label: 'สัปดาห์นี้', val: summary.thisWeek,         color: 'text-purple-400', bg: 'bg-purple-500/10' },
            { label: 'พลาด',      val: summary.missed,           color: 'text-red-400',    bg: 'bg-red-500/10' },
            { label: 'วิกฤต',    val: summary.criticalUpcoming, color: 'text-orange-400', bg: 'bg-orange-500/10' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl px-3 py-2 text-center`}>
              <p className={`text-xl font-bold ${s.color}`}>{s.val}</p>
              <p className="text-white/40 text-[12px] font-medium">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Toolbar ─────────────────────────────────────── */}
      <div className="px-4 py-2 flex items-center gap-2 shrink-0 border-b border-white/[0.05]">
        {/* Navigation */}
        <div className="flex items-center gap-1">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-xl hover:bg-white/10 text-white/50 hover:text-white transition">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => { setAnchor(new Date()); setView('week') }}
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-white/50 hover:text-white hover:bg-white/10 transition">
            วันนี้
          </button>
          <button onClick={() => navigate(1)} className="p-1.5 rounded-xl hover:bg-white/10 text-white/50 hover:text-white transition">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <span className="text-white/70 text-sm font-medium truncate">{currentLabel()}</span>

        <div className="ml-auto flex items-center gap-2">
          {/* Search */}
          <div className="relative hidden md:block">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="ค้นหา..."
              className="bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-white text-xs placeholder:text-white/30 focus:outline-none focus:border-green-500/50 w-40"
            />
          </div>

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(f => !f)}
            className={`p-1.5 rounded-xl transition ${showFilters ? 'bg-green-500/20 text-green-400' : 'hover:bg-white/10 text-white/40 hover:text-white'}`}
          >
            <Filter className="w-4 h-4" />
          </button>

          {/* View selector */}
          <div className="flex bg-white/5 rounded-xl p-0.5 text-xs">
            {(['month','week','agenda'] as View[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-2.5 py-1.5 rounded-lg font-medium transition ${view === v ? 'bg-green-600 text-white' : 'text-white/40 hover:text-white'}`}
              >
                {v === 'month' ? 'เดือน' : v === 'week' ? 'สัปดาห์' : 'รายการ'}
              </button>
            ))}
          </div>

          <button onClick={() => void loadEvents()} aria-label="โหลดใหม่" className="p-1.5 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {canEdit && (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-xs font-semibold transition"
            >
              <Plus className="w-3.5 h-3.5" /> เพิ่มนัด
            </button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="px-4 py-2 flex flex-wrap gap-2 border-b border-white/[0.05] bg-white/[0.02] shrink-0">
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="ค้นหา..."
            className="md:hidden bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-white text-xs placeholder:text-white/30 focus:outline-none focus:border-green-500/50 flex-1 min-w-[140px]"
          />
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-white text-xs focus:outline-none focus:border-green-500/50">
            <option value="">ทุกประเภท</option>
            {Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={priorityFilter} onChange={e => setPriority(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-white text-xs focus:outline-none focus:border-green-500/50">
            <option value="">ทุกความสำคัญ</option>
            <option value="CRITICAL">วิกฤต</option>
            <option value="HIGH">สูง</option>
            <option value="MEDIUM">ปานกลาง</option>
            <option value="LOW">ต่ำ</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-white text-xs focus:outline-none focus:border-green-500/50">
            <option value="">ทุกสถานะ</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {(typeFilter || priorityFilter || statusFilter || searchQ) && (
            <button
              onClick={() => { setTypeFilter(''); setPriority(''); setStatusFilter(''); setSearchQ('') }}
              className="text-white/40 hover:text-white text-xs px-2 py-1.5 rounded-xl hover:bg-white/10 transition"
            >
              ล้างตัวกรอง
            </button>
          )}
        </div>
      )}

      {/* ── Main content ─────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 gap-0">
        {/* Calendar area */}
        <div className={`flex flex-col flex-1 min-h-0 overflow-hidden transition-all ${selectedEvent ? 'md:w-2/3' : 'w-full'}`}>
          {loading ? (
            <div className="flex items-center justify-center flex-1 text-white/40">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-hidden p-2 md:p-4">
              {view === 'month' && (
                <MonthView anchor={anchor} events={events} onSelectDay={onSelectDay} onSelectEvent={e => setSelectedEvent(e)} today={today} />
              )}
              {view === 'week' && (
                <WeekView anchor={anchor} events={events} onSelectEvent={e => setSelectedEvent(e)} onSelectDay={onSelectDay} today={today} />
              )}
              {view === 'agenda' && (
                <AgendaView events={events} onSelectEvent={e => setSelectedEvent(e)} today={today} />
              )}
            </div>
          )}
        </div>

        {/* Detail panel (desktop) */}
        {selectedEvent && (
          <div className="hidden md:flex w-[300px] shrink-0 p-3 border-l border-white/[0.06] overflow-y-auto">
            <EventDetail
              event={selectedEvent}
              onClose={() => setSelectedEvent(null)}
              onStatusChange={handleStatusChange}
              canEdit={canEdit}
            />
          </div>
        )}
      </div>

      {/* Mobile event detail modal */}
      {selectedEvent && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/60 flex items-end justify-center p-0">
          <div ref={mobileDetailPanelRef} role="dialog" aria-modal aria-label={selectedEvent.title} tabIndex={-1} className="bg-slate-900 border-t border-white/10 rounded-t-3xl w-full max-h-[80dvh] overflow-y-auto p-4">
            <EventDetail
              event={selectedEvent}
              onClose={() => setSelectedEvent(null)}
              onStatusChange={handleStatusChange}
              canEdit={canEdit}
            />
          </div>
        </div>
      )}

      {/* FAB (mobile) */}
      {canEdit && (
        <button
          onClick={() => setShowAdd(true)}
          className="md:hidden fixed right-6 w-14 h-14 rounded-full bg-green-600 hover:bg-green-500 shadow-xl flex items-center justify-center z-30 transition"
          style={{ bottom: 'calc(58px + env(safe-area-inset-bottom) + 16px)' }}
        >
          <Plus className="w-6 h-6 text-white" />
        </button>
      )}

      {/* Add/Edit modal */}
      {(showAdd || editEvent) && (
        <AddEventModal
          onClose={() => { setShowAdd(false); setEditEvent(null) }}
          onSuccess={() => { void loadEvents(); void loadSummary() }}
          editEvent={editEvent}
        />
      )}
    </div>
  )
}
