'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, User, Search } from 'lucide-react'
import { formatThaiDate } from '@/lib/utils'
import {
  CATEGORY_BADGE, CATEGORY_COLORS, CATEGORY_LABELS,
  FILTER_ICONS, FILTER_LABELS, formatTimelineDate, formatTimelineMonth,
} from '@/lib/employee-timeline/constants'
import type {
  EmployeeTimelinePayload, TimelineEvent, TimelineFilter, TimelineStatusTone,
} from '@/lib/employee-timeline/types'
import { matchesTimelineFilter } from '@/lib/employee-timeline/types'

type Props = EmployeeTimelinePayload

const FILTERS: TimelineFilter[] = ['all', 'attendance', 'leave', 'warnings', 'payroll']

const STATUS_TONE_CLASS: Record<TimelineStatusTone, string> = {
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  danger: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  neutral: 'bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-400',
  info: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
}

function groupByMonth(events: TimelineEvent[]): { month: string; items: TimelineEvent[] }[] {
  const map = new Map<string, TimelineEvent[]>()
  for (const e of events) {
    const key = formatTimelineMonth(e.date)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(e)
  }
  return [...map.entries()].map(([month, items]) => ({ month, items }))
}

function TimelineRow({ event }: { event: TimelineEvent }) {
  const content = (
    <article className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-slate-900/70 p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-lg px-2 py-0.5 text-[12px] font-bold uppercase tracking-wide ${CATEGORY_BADGE[event.category]}`}>
            {CATEGORY_LABELS[event.category]}
          </span>
          {event.status && (
            <span className={`inline-flex rounded-lg px-2 py-0.5 text-[12px] font-bold ${STATUS_TONE_CLASS[event.statusTone ?? 'neutral']}`}>
              {event.status}
            </span>
          )}
        </div>
        {event.link && (
          <ExternalLink className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" aria-hidden />
        )}
      </div>
      <h3 className="text-[14px] font-bold text-slate-900 dark:text-white leading-snug">{event.title}</h3>
      <p className="mt-1.5 text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed">{event.details}</p>
    </article>
  )

  if (event.link) {
    return (
      <Link href={event.link} className="block group">
        {content}
      </Link>
    )
  }
  return content
}

export default function EmployeeTimelineClient({ employee, events, counts }: Props) {
  const [filter, setFilter] = useState<TimelineFilter>('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return events.filter((e) => {
      if (!matchesTimelineFilter(e.category, filter)) return false
      if (!q) return true
      return `${e.title} ${e.details} ${e.status ?? ''}`.toLowerCase().includes(q)
    })
  }, [events, filter, search])

  const grouped = useMemo(() => groupByMonth(filtered), [filtered])

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5 pb-24 md:pb-8">
      {/* Employee header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <Link
          href={`/employees/${employee.id}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 hover:text-green-600 dark:hover:text-green-400 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> กลับโปรไฟล์
        </Link>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-white/[0.07] bg-gradient-to-br from-slate-50 to-white dark:from-slate-900/80 dark:to-slate-900/40 p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-green-600 text-white">
            <User className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-900 dark:text-white truncate">{employee.name}</h1>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">
              {[employee.employeeId, employee.department, employee.position].filter(Boolean).join(' · ') || '—'}
            </p>
            {employee.startDate && (
              <p className="text-[12px] text-slate-400 mt-1">เริ่มงาน {formatThaiDate(employee.startDate)}</p>
            )}
          </div>
          <div className="ml-auto text-right flex-shrink-0">
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{events.length}</p>
            <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">เหตุการณ์</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-all border btn-press
              ${filter === f
                ? 'bg-green-600 text-white border-green-600 shadow-sm'
                : 'bg-white dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/[0.08] hover:border-green-300'
              }`}
          >
            <span>{FILTER_ICONS[f]}</span>
            {FILTER_LABELS[f]}
            <span className={`rounded-full px-1.5 py-0.5 text-[12px] font-bold min-w-[18px] text-center
              ${filter === f ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-white/10 text-slate-500'}`}>
              {counts[f]}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาในไทม์ไลน์..."
          className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/60 pl-10 pr-4 py-2.5 text-[13px] outline-none focus:border-green-400 dark:focus:border-green-500/50"
        />
      </div>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-white/10 py-16 text-center">
          <p className="text-4xl mb-2">{FILTER_ICONS[filter]}</p>
          <p className="text-[14px] font-semibold text-slate-600 dark:text-slate-300">ไม่พบเหตุการณ์ในหมวดนี้</p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ month, items }) => (
            <section key={month}>
              <h2 className="sticky top-0 z-10 mb-4 inline-flex rounded-lg bg-slate-100 dark:bg-white/[0.06] px-3 py-1 text-[12px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                {month}
              </h2>
              <ol className="relative space-y-0">
                {items.map((event, idx) => (
                  <li key={event.id} className="relative flex gap-4 pb-6 last:pb-0">
                    {/* spine */}
                    {idx < items.length - 1 && (
                      <span
                        className="absolute left-[5.5rem] top-8 bottom-0 w-px bg-slate-200 dark:bg-white/10 md:left-[6.5rem]"
                        aria-hidden
                      />
                    )}
                    {/* date column */}
                    <div className="w-[5.5rem] md:w-[6.5rem] flex-shrink-0 pt-1 text-right">
                      <time dateTime={event.date} className="block text-[12px] font-bold text-slate-700 dark:text-slate-200">
                        {formatTimelineDate(event.date)}
                      </time>
                      <span className="block text-[12px] text-slate-400 mt-0.5">
                        {new Date(event.date).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false })}
                      </span>
                    </div>
                    {/* dot */}
                    <div className="relative flex flex-col items-center flex-shrink-0 pt-2">
                      <span className={`h-3 w-3 rounded-full ring-4 ring-white dark:ring-[#070b14] ${CATEGORY_COLORS[event.category]}`} />
                    </div>
                    {/* event */}
                    <div className="flex-1 min-w-0">
                      <TimelineRow event={event} />
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
