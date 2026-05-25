'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

type AttendanceRecord = {
  date: string
  status: string
  checkIn: string | null
  checkOut: string | null
  lateMinutes: number
}

type LeaveRecord = {
  startDate: string
  endDate: string
  type: string
}

type Props = {
  attendance: AttendanceRecord[]
  leaves: LeaveRecord[]
  year: number
  month: number
}

const WEEKDAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']
const MONTHS_TH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                   'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']

const LEAVE_LABELS: Record<string, string> = {
  SICK: 'ป่วย', VACATION: 'พักร้อน', PERSONAL: 'กิจ',
  UNPAID: 'ไม่รับเงิน', MATERNITY: 'คลอด', ORDINATION: 'บวช',
}

const STATUS_STYLE: Record<string, { dot: string; bg: string; label: string }> = {
  NORMAL:   { dot: 'bg-blue-400',   bg: 'bg-blue-500/15 border-blue-500/25',   label: 'ปกติ' },
  LATE:     { dot: 'bg-yellow-400', bg: 'bg-yellow-500/15 border-yellow-500/25', label: 'สาย' },
  ABSENT:   { dot: 'bg-red-400',    bg: 'bg-red-500/15 border-red-500/25',     label: 'ขาด' },
  LEAVE:    { dot: 'bg-cyan-400',   bg: 'bg-cyan-500/15 border-cyan-500/25',   label: 'ลา' },
  OT:       { dot: 'bg-purple-400', bg: 'bg-purple-500/15 border-purple-500/25', label: 'OT' },
  HALF_DAY: { dot: 'bg-orange-400', bg: 'bg-orange-500/15 border-orange-500/25', label: 'ครึ่งวัน' },
}

export default function CalendarClient({ attendance, leaves, year: initYear, month: initMonth }: Props) {
  const [year, setYear] = useState(initYear)
  const [month, setMonth] = useState(initMonth)
  const [selected, setSelected] = useState<string | null>(null)

  const attendanceMap: Record<string, AttendanceRecord> = {}
  for (const r of attendance) {
    const key = r.date.slice(0, 10)
    attendanceMap[key] = r
  }

  const leaveSet = new Set<string>()
  for (const l of leaves) {
    const start = new Date(l.startDate)
    const end   = new Date(l.endDate)
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      leaveSet.add(d.toISOString().slice(0, 10))
    }
  }

  const navigate = (delta: number) => {
    let m = month + delta
    let y = year
    if (m < 0)  { m = 11; y-- }
    if (m > 11) { m = 0;  y++ }
    setMonth(m); setYear(y); setSelected(null)
  }

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date().toISOString().slice(0, 10)

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  // Summary stats
  const presentDays = attendance.filter(r => r.status === 'NORMAL' || r.status === 'OT').length
  const lateDays    = attendance.filter(r => r.status === 'LATE').length
  const absentDays  = attendance.filter(r => r.status === 'ABSENT').length
  const leaveDays   = leaveSet.size

  const selectedKey = selected
  const selectedRecord = selectedKey ? attendanceMap[selectedKey] : null

  return (
    <div className="p-4 md:p-5 space-y-5">
      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'มาทำงาน', value: presentDays, dot: 'bg-blue-400' },
          { label: 'มาสาย',   value: lateDays,    dot: 'bg-yellow-400' },
          { label: 'ขาดงาน',  value: absentDays,  dot: 'bg-red-400' },
          { label: 'วันลา',   value: leaveDays,   dot: 'bg-cyan-400' },
        ].map(s => (
          <div key={s.label} className="rounded-2xl p-3.5 text-center"
            style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className={`mx-auto mb-1.5 h-2 w-2 rounded-full ${s.dot}`} />
            <p className="text-xl font-extrabold text-white">{s.value}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Calendar */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.07)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <button onClick={() => navigate(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-white/[0.06] hover:text-white transition-all">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
          </button>
          <div className="text-center">
            <p className="font-semibold text-white text-[15px]">{MONTHS_TH[month]} {year + 543}</p>
          </div>
          <button onClick={() => navigate(1)}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-white/[0.06] hover:text-white transition-all">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-white/[0.04]">
          {WEEKDAYS.map((d, i) => (
            <div key={d} className={cn(
              'py-2.5 text-center text-[11px] font-semibold',
              i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-500',
            )}>{d}</div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7">
          {cells.map((day, idx) => {
            if (!day) return <div key={idx} className="aspect-square md:h-16" />
            const key = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
            const rec = attendanceMap[key]
            const isLeave = leaveSet.has(key)
            const isToday = key === today
            const isSelected = key === selectedKey
            const dayOfWeek = new Date(year, month, day).getDay()
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
            const style = rec ? STATUS_STYLE[rec.status] : isLeave ? STATUS_STYLE.LEAVE : null

            return (
              <button
                key={key}
                onClick={() => setSelected(isSelected ? null : key)}
                className={cn(
                  'relative flex flex-col items-center justify-start py-2 aspect-square md:h-16 border-b border-r border-white/[0.03] transition-all text-xs',
                  isSelected ? 'bg-blue-500/20 border-blue-500/30' : 'hover:bg-white/[0.04]',
                  isWeekend && !isSelected ? 'bg-white/[0.01]' : '',
                )}
              >
                {/* Day number */}
                <span className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold leading-none',
                  isToday ? 'bg-blue-500 text-white' : isWeekend ? 'text-slate-500' : 'text-slate-300',
                )}>{day}</span>

                {/* Status dot */}
                {style && (
                  <span className={cn('mt-1 h-1.5 w-1.5 rounded-full', style.dot)} />
                )}

                {/* Status label (md+) */}
                {style && (
                  <span className={cn(
                    'hidden md:block mt-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold border',
                    style.bg,
                  )}>
                    {style.label}
                    {rec?.lateMinutes ? ` +${rec.lateMinutes}` : ''}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected day detail */}
      {selected && (
        <div className="rounded-2xl p-4"
          style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(59,130,246,0.2)' }}>
          <p className="text-[13px] font-semibold text-blue-300 mb-3">
            รายละเอียด — {new Date(selected).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          {selectedRecord ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { label: 'สถานะ', value: STATUS_STYLE[selectedRecord.status]?.label ?? selectedRecord.status },
                { label: 'เข้างาน', value: selectedRecord.checkIn ? new Date(selectedRecord.checkIn).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '—' },
                { label: 'ออกงาน', value: selectedRecord.checkOut ? new Date(selectedRecord.checkOut).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '—' },
                { label: 'สาย', value: selectedRecord.lateMinutes > 0 ? `${selectedRecord.lateMinutes} นาที` : '—' },
              ].map(item => (
                <div key={item.label} className="rounded-xl bg-white/[0.04] p-3 border border-white/[0.06]">
                  <p className="text-[10px] text-slate-500">{item.label}</p>
                  <p className="text-[13px] font-semibold text-white mt-0.5">{item.value}</p>
                </div>
              ))}
            </div>
          ) : leaveSet.has(selected) ? (
            <p className="text-sm text-cyan-400">📅 วันลา</p>
          ) : (
            <p className="text-sm text-slate-500">ไม่มีข้อมูลการเข้างาน</p>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
        {Object.entries(STATUS_STYLE).map(([, s]) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', s.dot)} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}
