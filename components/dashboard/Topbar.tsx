'use client'

import { cn } from '@/lib/utils'

type Props = {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

/** Page title bar — user menu & logout are in DashboardHeader (layout) */
export default function Topbar({ title, subtitle, actions }: Props) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 md:px-6 md:py-4',
        'border-b dark:border-white/[0.05] light:border-slate-200/80',
      )}
    >
      <div className="flex-1 min-w-0">
        <h1 className="truncate text-[15px] sm:text-base font-bold dark:text-white light:text-slate-800 leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[11px] sm:text-xs text-slate-500 truncate leading-none mt-0.5">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  )
}
