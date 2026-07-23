'use client'

import { cn } from '@/lib/utils'

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

type Props = {
  /** "HH:MM" or empty string */
  value: string
  onChange: (value: string) => void
  hourId?: string
  minuteId?: string
  'aria-label'?: string
  className?: string
  selectClassName?: string
  required?: boolean
}

/**
 * Native <input type="time"> renders its picker in 12h AM/PM or 24h format
 * depending on the OS locale, not this app's own locale/lang setting — there
 * is no reliable HTML/CSS way to force 24h display (see WHATWG issue #6698,
 * still open). A user whose Windows region is set to a 12h-clock locale sees
 * an hour segment that only accepts 1-12 + AM/PM; typing "21" for 9pm silently
 * gets misinterpreted. This component sidesteps the native widget entirely —
 * two plain <select> lists with hardcoded "00".."23" / "00".."59" values are
 * immune to locale, since <option> text has no native time-formatting behavior.
 */
export default function TimeSelect24h({
  value, onChange, hourId, minuteId, className, selectClassName, required,
  'aria-label': ariaLabel,
}: Props) {
  const [h, m] = value ? value.split(':') : ['', '']

  function setHour(newH: string) {
    if (!newH) { onChange(''); return }
    onChange(`${newH}:${m || '00'}`)
  }
  function setMinute(newM: string) {
    if (!h && !newM) { onChange(''); return }
    onChange(`${h || '00'}:${newM || '00'}`)
  }

  const selectCls = selectClassName ?? 'bg-white/5 border border-white/10 rounded-xl px-2 py-2.5 text-white text-sm focus:outline-none focus:border-green-500/50'

  return (
    <div className={cn('flex items-center gap-1', className)} role="group" aria-label={ariaLabel}>
      <select
        id={hourId}
        value={h}
        onChange={(e) => setHour(e.target.value)}
        aria-label={ariaLabel ? `${ariaLabel} — ชั่วโมง` : 'ชั่วโมง'}
        required={required}
        className={selectCls}
      >
        <option value="">--</option>
        {HOURS.map((hh) => <option key={hh} value={hh}>{hh}</option>)}
      </select>
      <span className="text-white/40" aria-hidden>:</span>
      <select
        id={minuteId}
        value={m}
        onChange={(e) => setMinute(e.target.value)}
        aria-label={ariaLabel ? `${ariaLabel} — นาที` : 'นาที'}
        required={required}
        className={selectCls}
      >
        <option value="">--</option>
        {MINUTES.map((mm) => <option key={mm} value={mm}>{mm}</option>)}
      </select>
    </div>
  )
}
