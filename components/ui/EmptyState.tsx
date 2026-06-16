import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

type Props = {
  icon?: ReactNode
  title: string
  subtitle?: string
  action?: ReactNode
  className?: string
  compact?: boolean
}

export default function EmptyState({ icon, title, subtitle, action, className, compact }: Props) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-8 px-4' : 'py-16 px-6',
        className,
      )}
    >
      {icon && (
        <div className={cn('mb-3 flex items-center justify-center rounded-2xl', compact ? 'w-10 h-10' : 'w-14 h-14',
          'bg-slate-100 dark:bg-white/[0.04] text-slate-400 dark:text-slate-500')}>
          {icon}
        </div>
      )}
      <p className={cn('font-semibold text-slate-700 dark:text-slate-300', compact ? 'text-sm' : 'text-base')}>
        {title}
      </p>
      {subtitle && (
        <p className={cn('mt-1 text-slate-500 dark:text-slate-500', compact ? 'text-xs' : 'text-sm', 'max-w-xs')}>
          {subtitle}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
