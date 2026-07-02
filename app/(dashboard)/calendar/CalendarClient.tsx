'use client'

import { useMemo, useState } from 'react'
import { cn, formatLateMinutes } from '@/lib/utils'
import { buildHolidayMapForMonth, type HolidayRecord } from '@/lib/company-holidays'
import HolidayManagePanel, { type HolidayItem } from '@/components/calendar/HolidayManagePanel'

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

type BranchOpt = { id: string; label: string }

type Props = {
  attendance: AttendanceRecord[]
  leaves: LeaveRecord[]
  year: number
  month: number
  branchId: string | null
  initialHolidays: HolidayItem[]
  branches: BranchOpt[]
  canManageHolidays: boolean
}

const WEEKDAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']
const MONTHS_TH = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

const LEAVE_LABELS: Record<string, string> = {
  SICK: 'ป่วย',
  VACATION: 'พักร้อน',
  PERSONAL: 'กิจ',
  UNPAID: 'ไม่รับเงิน',
  MATERNITY: 'คลอด',
  ORDINATION: 'บวช',
}

const STATUS_STYLE: Record<string, { dot: string; bg: string; label: string }> = {
  NORMAL: { dot: 'bg-green-400', bg: 'bg-green-500/15 border-green-500/25', label: 'ปกติ' },
  LATE: { dot: 'bg-yellow-400', bg: 'bg-yellow-500/15 border-yellow-500/25', label: 'สาย' },
  ABSENT: { dot: 'bg-red-400', bg: 'bg-red-500/15 border-red-500/25', label: 'ขาด' },
  LEAVE: { dot: 'bg-cyan-400', bg: 'bg-cyan-500/15 border-cyan-500/25', label: 'ลา' },
  OT: { dot: 'bg-purple-400', bg: 'bg-purple-500/15 border-purple-500/25', label: 'OT' },
  HALF_DAY: { dot: 'bg-orange-400', bg: 'bg-orange-500/15 border-orange-500/25', label: 'ครึ่งวัน' },
}

const HOLIDAY_STYLE = {
  dot: 'bg-emerald-400',
  bg: 'bg-emerald-500/20 border-emerald-500/35',
  cell: 'bg-emerald-500/[0.08]',
}

function toHolidayRecords(items: HolidayItem[]): HolidayRecord[] {
  return items.map((h) => ({
    id: h.id,
    holidayName: h.holidayName,
    holidayDate: new Date(`${h.holidayDate}T12:00:00.000Z`),
    holidayType: h.holidayType,
    repeatEveryYear: h.repeatEveryYear,
    branchId: h.branchId,
  }))
}

export default function CalendarClient({
  attendance,
  leaves,
  year: initYear,
  month: initMonth,
  branchId,
  initialHolidays,
  branches,
  canManageHolidays,
}: Props) {
  const [year, setYear] = useState(initYear)
  const [month, setMonth] = useState(initMonth)
  const [selected, setSelected] = useState<string | null>(null)
  const [holidayItems, setHolidayItems] = useState(initialHolidays)
  const [editHolidayId, setEditHolidayId] = useState<string | null>(null)

  const holidayRecords = useMemo(() => toHolidayRecords(holidayItems), [holidayItems])

  const holidayMap = useMemo(
    () => buildHolidayMapForMonth(year, month, branchId, holidayRecords),
    [year, month, branchId, holidayRecords],
  )

  const attendanceMap: Record<string, AttendanceRecord> = {}
  for (const r of attendance) {
    attendanceMap[r.date.slice(0, 10)] = r
  }

  const leaveSet = new Set<string>()
  for (const l of leaves) {
    const start = new Date(l.startDate)
    const end = new Date(l.endDate)
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      leaveSet.add(d.toISOString().slice(0, 10))
    }
  }

  const navigate = (delta: number) => {
    let m = month + delta
    let y = year
    if (m < 0) {
      m = 11
      y--
    }
    if (m > 11) {
      m = 0
      y++
    }
    setMonth(m)
    setYear(y)
    setSelected(null)
    setEditHolidayId(null)
  }

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date().toISOString().slice(0, 10)

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const presentDays = attendance.filter((r) => r.status === 'NORMAL' || r.status === 'OT').length
  const lateDays = attendance.filter((r) => r.status === 'LATE').length
  const absentDays = attendance.filter((r) => r.status === 'ABSENT').length
  const leaveDays = leaveSet.size
  const holidayDaysInMonth = Object.keys(holidayMap).length

  const selectedKey = selected
  const selectedRecord = selectedKey ? attendanceMap[selectedKey] : null
  const selectedHoliday = selectedKey ? holidayMap[selectedKey] : null

  return (
    <div className="p-4 md:p-5 xl:p-6 space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'มาทำงาน', value: presentDays, dot: 'bg-green-400' },
          { label: 'มาสาย', value: lateDays, dot: 'bg-yellow-400' },
          { label: 'ขาดงาน', value: absentDays, dot: 'bg-red-400' },
          { label: 'วันลา', value: leaveDays, dot: 'bg-cyan-400' },
          { label: 'วันหยุด', value: holidayDaysInMonth, dot: 'bg-emerald-400' },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl p-3.5 text-center glass-card"
          >
            <div className={`mx-auto mb-1.5 h-2 w-2 rounded-full ${s.dot}`} />
            <p className="text-xl font-extrabold dark:text-white light:text-slate-900">{s.value}</p>
            <p className="text-[12px] dark:text-slate-500 light:text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b dark:border-white/[0.06] light:border-slate-200">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-xl dark:text-slate-400 light:text-slate-600 hover:bg-white/[0.06]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="text-center">
            <p className="font-semibold dark:text-white light:text-slate-900 text-[15px]">
              {MONTHS_TH[month]} {year + 543}
            </p>
            <p className="text-[12px] dark:text-slate-500 light:text-slate-500 mt-0.5">
              วันหยุดบริษัทแสดงสีเขียว — ทุกคนในสาขาเห็นเหมือนกัน
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate(1)}
            className="flex h-8 w-8 items-center justify-center rounded-xl dark:text-slate-400 light:text-slate-600 hover:bg-white/[0.06]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-7 border-b dark:border-white/[0.04] light:border-slate-100">
          {WEEKDAYS.map((d, i) => (
            <div
              key={d}
              className={cn(
                'py-2.5 text-center text-[11px] font-semibold',
                i === 0 ? 'text-red-400' : i === 6 ? 'text-green-400' : 'dark:text-slate-500 light:text-slate-500',
              )}
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((day, idx) => {
            if (!day) return <div key={'empty-' + idx} className="min-h-[48px] md:h-16" />
            const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const rec = attendanceMap[key]
            const holiday = holidayMap[key]
            const isLeave = leaveSet.has(key)
            const isToday = key === today
            const isSelected = key === selectedKey
            const attStyle = rec ? STATUS_STYLE[rec.status] : isLeave ? STATUS_STYLE.LEAVE : null

            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setSelected(isSelected ? null : key)
                  setEditHolidayId(null)
                }}
                className={cn(
                  'relative flex flex-col items-center justify-start py-1.5 min-h-[48px] md:h-16 border-b border-r dark:border-white/[0.03] light:border-slate-100 transition-all text-xs touch-manipulation',
                  isSelected ? 'bg-green-500/20 border-green-500/30' : 'hover:bg-white/[0.04]',
                  holiday && !isSelected ? HOLIDAY_STYLE.cell : '',
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold leading-none',
                    isToday
                      ? 'bg-green-500 text-white'
                      : holiday
                        ? 'text-emerald-300'
                        : 'dark:text-slate-300 light:text-slate-700',
                  )}
                >
                  {day}
                </span>

                {holiday && (
                  <span className={cn('mt-0.5 h-1.5 w-1.5 rounded-full', HOLIDAY_STYLE.dot)} />
                )}
                {!holiday && attStyle && (
                  <span className={cn('mt-0.5 h-1.5 w-1.5 rounded-full', attStyle.dot)} />
                )}

                {holiday && (
                  <span
                    className={cn(
                      'hidden md:block mt-0.5 rounded px-1 py-0.5 text-[8px] font-semibold border truncate max-w-[92%]',
                      HOLIDAY_STYLE.bg,
                      'text-emerald-200',
                    )}
                    title={holiday.holidayName}
                  >
                    {holiday.holidayName.length > 8
                      ? `${holiday.holidayName.slice(0, 7)}…`
                      : holiday.holidayName}
                  </span>
                )}
                {!holiday && attStyle && (
                  <span
                    className={cn(
                      'hidden md:block mt-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold border',
                      attStyle.bg,
                    )}
                  >
                    {attStyle.label}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {selected && (
        <div className="glass-card rounded-2xl p-4 border dark:border-green-500/20 light:border-green-200">
          <p className="text-[13px] font-semibold text-green-300 dark:text-green-300 light:text-green-700 mb-3">
            รายละเอียด —{' '}
            {new Date(selected).toLocaleDateString('th-TH', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>

          {selectedHoliday && (
            <div className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
              <p className="text-xs text-emerald-400/90 font-semibold uppercase tracking-wide">วันหยุดบริษัท</p>
              <p className="text-sm font-semibold text-emerald-100 mt-1">{selectedHoliday.holidayName}</p>
              <p className="text-xs text-emerald-200/80 mt-0.5">{selectedHoliday.typeLabel}</p>
              {canManageHolidays && (
                <button
                  type="button"
                  onClick={() => setEditHolidayId(selectedHoliday.id)}
                  className="mt-2 text-xs font-semibold text-emerald-300 hover:text-emerald-200 underline"
                >
                  แก้ไขกฎวันหยุดนี้ (HR)
                </button>
              )}
            </div>
          )}

          {selectedRecord ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { label: 'สถานะ', value: STATUS_STYLE[selectedRecord.status]?.label ?? selectedRecord.status },
                {
                  label: 'เข้างาน',
                  value: selectedRecord.checkIn
                    ? new Date(selectedRecord.checkIn).toLocaleTimeString('th-TH', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '—',
                },
                {
                  label: 'ออกงาน',
                  value: selectedRecord.checkOut
                    ? new Date(selectedRecord.checkOut).toLocaleTimeString('th-TH', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '—',
                },
                {
                  label: 'สาย',
                  value: selectedRecord.lateMinutes > 0 ? formatLateMinutes(selectedRecord.lateMinutes) : '—',
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl dark:bg-white/[0.04] light:bg-slate-50 p-3 border dark:border-white/[0.06] light:border-slate-200"
                >
                  <p className="text-[12px] dark:text-slate-500">{item.label}</p>
                  <p className="text-[13px] font-semibold dark:text-white light:text-slate-800 mt-0.5">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          ) : leaveSet.has(selected) ? (
            <p className="text-sm text-cyan-400">📅 วันลา</p>
          ) : selectedHoliday ? (
            <p className="text-sm dark:text-slate-400 light:text-slate-600">วันหยุด — ไม่มีบันทึกเข้างาน</p>
          ) : (
            <p className="text-sm dark:text-slate-500">ไม่มีข้อมูลการเข้างาน</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-[11px] dark:text-slate-500 light:text-slate-500">
        {Object.entries(STATUS_STYLE).map(([, s]) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', s.dot)} />
            {s.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className={cn('h-2 w-2 rounded-full', HOLIDAY_STYLE.dot)} />
          วันหยุดบริษัท
        </span>
      </div>

      {canManageHolidays && branches.length > 0 && (
        <HolidayManagePanel
          initialHolidays={holidayItems}
          branches={branches}
          calendarYear={year}
          calendarMonth={month}
          onHolidaysChange={setHolidayItems}
          editHolidayId={editHolidayId}
        />
      )}
    </div>
  )
}
