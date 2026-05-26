'use client'

import { CheckCircle, Circle } from 'lucide-react'

type Props = {
  checkIn: string | null
  lunchOut: string | null
  lunchIn: string | null
  checkOut: string | null
  workPlaceName?: string | null
}

const STEPS = [
  { key: 'checkIn', label: 'เช็คอิน', color: 'text-green-400' },
  { key: 'lunchOut', label: 'เริ่มพักกลางวัน', color: 'text-amber-400' },
  { key: 'lunchIn', label: 'กลับจากพัก', color: 'text-amber-300' },
  { key: 'checkOut', label: 'เช็คเอาท์', color: 'text-blue-400' },
] as const

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

export default function AttendanceTimeline({ checkIn, lunchOut, lunchIn, checkOut, workPlaceName }: Props) {
  const times: Record<string, string | null> = { checkIn, lunchOut, lunchIn, checkOut }

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 space-y-3">
      {workPlaceName && (
        <p className="text-xs text-cyan-400/90">
          📍 สถานที่ทำงาน: <span className="font-semibold text-white">{workPlaceName}</span>
          <span className="text-slate-500 ml-1">(ชื่อที่บันทึก — GPS แยกต่างหาก)</span>
        </p>
      )}
      <div className="space-y-0">
        {STEPS.map((step, i) => {
          const done = !!times[step.key]
          const isLast = i === STEPS.length - 1
          return (
            <div key={step.key} className="flex gap-3">
              <div className="flex flex-col items-center">
                {done ? (
                  <CheckCircle className={`w-5 h-5 ${step.color}`} />
                ) : (
                  <Circle className="w-5 h-5 text-slate-600" />
                )}
                {!isLast && <div className={`w-0.5 flex-1 min-h-[28px] ${done ? 'bg-white/20' : 'bg-white/5'}`} />}
              </div>
              <div className={`pb-4 ${isLast ? 'pb-0' : ''}`}>
                <p className={`text-sm font-semibold ${done ? 'text-white' : 'text-slate-500'}`}>{step.label}</p>
                <p className={`text-lg font-bold tabular-nums ${done ? step.color : 'text-slate-600'}`}>
                  {fmt(times[step.key])}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
