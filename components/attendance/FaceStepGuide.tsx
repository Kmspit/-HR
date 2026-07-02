'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export type FaceGuideStep = {
  title: string
  body: string
  tip?: string
}

type Props = {
  steps: FaceGuideStep[]
  currentIndex: number
  className?: string
}

export default function FaceStepGuide({ steps, currentIndex, className }: Props) {
  const total = steps.length
  const pct = total > 1 ? Math.round((currentIndex / (total - 1)) * 100) : 100

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide dark:text-slate-400 light:text-slate-500">
          ขั้นตอนที่ {currentIndex + 1} / {total}
        </p>
        <span className="text-[11px] tabular-nums dark:text-cyan-400 light:text-green-600 font-medium">
          {pct}%
        </span>
      </div>

      <div
        className="h-1.5 rounded-full overflow-hidden dark:bg-white/10 light:bg-slate-200"
        role="progressbar"
        aria-valuenow={currentIndex + 1}
        aria-valuemin={1}
        aria-valuemax={total}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-green-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ol className="space-y-2" aria-label="ขั้นตอนการสอน">
        {steps.map((s, i) => {
          const done = i < currentIndex
          const active = i === currentIndex
          return (
            <li
              key={s.title}
              className={cn(
                'flex gap-2.5 rounded-xl px-3 py-2.5 border transition-colors',
                active &&
                  'dark:bg-cyan-500/10 dark:border-cyan-500/30 light:bg-green-50 light:border-green-200',
                done &&
                  !active &&
                  'dark:bg-white/[0.02] dark:border-white/5 light:bg-slate-50/80 light:border-slate-100 opacity-80',
                !done &&
                  !active &&
                  'dark:border-transparent light:border-transparent opacity-45',
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                  done && 'bg-green-500/20 text-green-400',
                  active && !done && 'bg-cyan-500/25 text-cyan-300 light:text-green-700',
                  !done && !active && 'dark:bg-white/5 light:bg-slate-200 dark:text-slate-500 light:text-slate-500',
                )}
                aria-hidden
              >
                {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'text-xs font-semibold leading-snug',
                    active
                      ? 'dark:text-white light:text-slate-900'
                      : 'dark:text-slate-400 light:text-slate-600',
                  )}
                >
                  {s.title}
                </p>
                {active && (
                  <>
                    <p className="text-[11px] mt-1 dark:text-slate-300 light:text-slate-600 leading-relaxed">
                      {s.body}
                    </p>
                    {s.tip && (
                      <p className="text-[12px] mt-1.5 rounded-lg px-2 py-1 dark:bg-amber-500/10 dark:text-amber-200/90 light:bg-amber-50 light:text-amber-800">
                        💡 {s.tip}
                      </p>
                    )}
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export const REGISTER_GUIDE_STEPS: FaceGuideStep[] = [
  {
    title: 'เริ่มต้น',
    body: 'ลงทะเบียนครั้งเดียว เก็บเฉพาะรหัสใบหน้าเข้ารหัส ไม่เก็บรูปถาวร',
    tip: 'ใช้กล้องหน้าเท่านั้น',
  },
  {
    title: 'เปิดกล้อง',
    body: 'อนุญาตกล้อง แล้วกดเริ่มสแกนอัตโนมัติเมื่อเห็นหน้าตัวเองชัด',
  },
  {
    title: 'มองตรงกล้อง',
    body: 'มองตรงกล้อง ใบหน้าอยู่กลางกรอบ — ระบบจะถ่ายหลายภาพให้อัตโนมัติ',
    tip: 'ถอดแว่น/หมวกที่บังใบหน้า อยู่ในที่แสงเพียงพอ',
  },
]
