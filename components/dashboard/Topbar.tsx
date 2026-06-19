'use client'

import { cn } from '@/lib/utils'

type StatChip = {
  label: string
  value: string | number
  color?: 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'slate'
}

type Props = {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  stats?: StatChip[]
  breadcrumb?: Array<{ label: string; href?: string }>
}

const CHIP_COLORS: Record<NonNullable<StatChip['color']>, string> = {
  blue:   'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
  green:  'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20',
  amber:  'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
  red:    'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20',
  violet: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20',
  slate:  'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/20',
}

export default function Topbar({ title, subtitle, actions, stats, breadcrumb }: Props) {
  return (
    <div
      className={cn(
        'sticky top-16 md:top-0 z-10',
        'border-b border-slate-200 dark:border-white/[0.05]',
        'bg-white dark:bg-[rgba(7,11,20,0.98)] md:bg-white/80 md:dark:bg-transparent',
        'backdrop-blur-sm',
        stats ? 'px-5 pt-3 pb-0 md:px-6 md:pt-4' : 'px-5 py-3 md:px-6 md:py-4',
      )}
    >
      {/* Breadcrumb */}
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="mb-1.5 flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
          {breadcrumb.map((crumb, i) => (
            <span key={crumb.label} className="flex items-center gap-1.5">
              {i > 0 && <span>/</span>}
              {crumb.href ? (
                <a href={crumb.href} className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                  {crumb.label}
                </a>
              ) : (
                <span className="text-slate-600 dark:text-slate-300 font-medium">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      {/* Title row */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex-1 min-w-0">
          <h1 className="truncate text-[17px] sm:text-[19px] font-bold text-slate-900 dark:text-white leading-tight tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[12.5px] text-slate-500 dark:text-slate-400 truncate leading-none mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>

      {/* Stats chips row */}
      {stats && stats.length > 0 && (
        <div className="flex items-center gap-2 mt-3 mb-0 overflow-x-auto no-scrollbar pb-3">
          {stats.map((s) => (
            <div
              key={s.label}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11.5px] font-medium flex-shrink-0',
                CHIP_COLORS[s.color ?? 'slate'],
              )}
            >
              <span className="font-bold">{s.value}</span>
              <span className="opacity-80">{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
