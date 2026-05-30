'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Smartphone, Trash2, MessageCircle, MapPin, ImageOff } from 'lucide-react'
import {
  listLocalAttendanceLogs,
  clearLocalAttendanceLogs,
  type LocalAttendanceLogEntry,
} from '@/lib/attendance-local-log'

const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
] as const

function eventBadgeClass(event: string): string {
  switch (event) {
    case 'checkin':
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
    case 'checkout':
      return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
    case 'lunch-out':
      return 'bg-amber-500/20 text-amber-300 border-amber-500/30'
    case 'lunch-in':
      return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
    default:
      return 'bg-slate-500/20 text-slate-300 border-slate-500/30'
  }
}

export default function AttendanceLocalHistory({
  userId,
  refreshKey = 0,
}: {
  userId: string
  refreshKey?: number
}) {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [entries, setEntries] = useState<LocalAttendanceLogEntry[]>([])

  const reload = useCallback(() => {
    setEntries(listLocalAttendanceLogs({ userId, month, year }))
  }, [userId, month, year])

  useEffect(() => {
    reload()
  }, [reload, refreshKey])

  const grouped = useMemo(() => {
    const map = new Map<string, LocalAttendanceLogEntry[]>()
    for (const e of entries) {
      const key = e.employeeName
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'th'))
  }, [entries])

  return (
    <div
      className="rounded-2xl p-4 space-y-3"
      style={{
        background: 'rgba(13,19,33,0.75)',
        border: '1px solid rgba(99,102,241,0.25)',
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-indigo-400" />
          <div>
            <p className="text-sm font-bold text-white">บันทึกบนเครื่องมือถือ</p>
            <p className="text-[10px] text-slate-400">
              เก็บในเครื่องนี้ · ส่ง LINE HR ผ่านเซิร์ฟเวอร์เมื่อสแกนสำเร็จ
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (confirm('ลบประวัติบนเครื่องทั้งหมดของคุณ?')) {
              clearLocalAttendanceLogs(userId)
              reload()
            }
          }}
          className="text-[10px] text-slate-500 hover:text-red-400 flex items-center gap-1"
        >
          <Trash2 className="w-3 h-3" />
          ล้างในเครื่อง
        </button>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-[10px] text-slate-400">
          เดือน
          <select
            className="input mt-0.5 block text-xs min-w-[120px]"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {THAI_MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[10px] text-slate-400">
          ปี
          <input
            type="number"
            className="input mt-0.5 w-24 text-xs"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
        </label>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-slate-500 text-center py-4">ไม่มีบันทึกในเดือนนี้บนเครื่อง</p>
      ) : (
        <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
          {grouped.map(([name, rows]) => (
            <div key={name} className="space-y-2">
              <p className="text-xs font-semibold text-indigo-300 sticky top-0 bg-[#0d1321]/95 py-1">
                {name}
                {rows[0]?.employeeCode ? (
                  <span className="text-slate-500 font-normal"> · {rows[0].employeeCode}</span>
                ) : null}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {rows.map((e) => (
                  <div
                    key={e.id}
                    className="flex gap-2 rounded-xl border border-white/8 bg-black/25 p-2"
                  >
                    <div className="w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-slate-900">
                      {e.photoThumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={e.photoThumb}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageOff className="w-5 h-5 text-slate-600" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <span
                        className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded border ${eventBadgeClass(e.event)}`}
                      >
                        {e.eventLabel}
                      </span>
                      <p className="text-[11px] text-white leading-tight">
                        {new Date(e.scannedAt).toLocaleString('th-TH', {
                          timeZone: 'Asia/Bangkok',
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                      {(e.workPlaceName || e.address) && (
                        <p className="text-[10px] text-slate-500 line-clamp-1 flex items-center gap-0.5">
                          <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                          {e.workPlaceName ?? e.address}
                        </p>
                      )}
                      <p
                        className={`text-[9px] flex items-center gap-0.5 ${
                          e.lineSent ? 'text-green-400' : e.lineFailed > 0 ? 'text-amber-400' : 'text-slate-600'
                        }`}
                      >
                        <MessageCircle className="w-2.5 h-2.5" />
                        {e.lineSent
                          ? 'ส่ง LINE HR แล้ว'
                          : e.lineFailed > 0
                            ? 'ส่ง LINE ไม่สำเร็จ'
                            : 'รอส่ง LINE / ไม่มี OA'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
