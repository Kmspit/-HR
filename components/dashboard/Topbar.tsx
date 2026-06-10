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
        'flex items-center gap-3 px-5 py-4 md:px-6 md:py-5',
        'border-b border-slate-200 dark:border-white/[0.05]',
      )}
    >
      <div className="flex-1 min-w-0">
        <h1 className="truncate text-[18px] sm:text-[20px] font-bold text-slate-900 dark:text-white leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[13px] sm:text-[14px] text-slate-500 dark:text-slate-400 truncate leading-none mt-1">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  )
}
