'use client'

import { useEffect, useState } from 'react'

export default function RealtimeClock() {
  const [time, setTime] = useState('')
  const [date, setDate] = useState('')

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setTime(
        now.toLocaleTimeString('th-TH', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
          timeZone: 'Asia/Bangkok',
        }),
      )
      setDate(
        now.toLocaleDateString('th-TH', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'Asia/Bangkok',
        }),
      )
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div
      className="flex items-center justify-between gap-4 rounded-2xl px-5 py-4"
      style={{
        background: 'linear-gradient(135deg,rgba(34,197,94,0.1),rgba(99,102,241,0.07))',
        border: '1px solid rgba(34,197,94,0.18)',
      }}
    >
      {/* Left: icon + date */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ background: 'linear-gradient(135deg,#22c55e,#6366f1)', boxShadow: '0 4px 12px rgba(22,163,74,0.3)' }}>
          <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <p className="text-[11px] text-slate-500">เวลาปัจจุบัน</p>
          <p className="text-[12px] font-medium text-slate-300 mt-0.5">{date}</p>
        </div>
      </div>

      {/* Right: big clock */}
      <p
        className="text-3xl sm:text-4xl font-extrabold tabular-nums tracking-tight flex-shrink-0"
        style={{
          background: 'linear-gradient(135deg,#60a5fa,#818cf8)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        {time || '00:00:00'}
      </p>
    </div>
  )
}
