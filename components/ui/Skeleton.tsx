import { cn } from '@/lib/utils'

type SkeletonProps = {
  className?: string
  style?: React.CSSProperties
}

export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div
      className={cn('skeleton dark:bg-white/[0.06] light:bg-slate-200/90', className)}
      style={style}
      aria-hidden
    />
  )
}

export function SkeletonStatGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-20 rounded-2xl"
          style={{ animationDelay: `${i * 60}ms` }}
        />
      ))}
    </div>
  )
}

export function TableSkeletonRows({
  rows = 6,
  cols = 7,
}: {
  rows?: number
  cols?: number
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-white/5">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="p-3">
              <Skeleton
                className={cn('h-4', j === 0 ? 'w-28' : 'w-10', j !== 0 && 'mx-auto')}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

export function CardSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-slate-200 dark:border-white/[0.06] p-4 space-y-3"
          style={{ animationDelay: `${i * 50}ms` }}
        >
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-3/4 rounded-lg" />
              <Skeleton className="h-3 w-1/2 rounded-lg" />
            </div>
          </div>
          <Skeleton className="h-3 w-full rounded-lg" />
          <Skeleton className="h-3 w-2/3 rounded-lg" />
        </div>
      ))}
    </div>
  )
}

export function ListSkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-white/[0.06] p-3"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <Skeleton className="w-9 h-9 rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-48 rounded-lg" />
            <Skeleton className="h-3 w-32 rounded-lg" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full flex-shrink-0" />
        </div>
      ))}
    </div>
  )
}

export function PageSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-5">
      <SkeletonStatGrid count={4} />
      <div className="rounded-2xl border border-slate-200 dark:border-white/[0.06] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.05]">
          <Skeleton className="h-4 w-40 rounded-lg" />
        </div>
        <div className="p-4">
          <ListSkeletonRows rows={5} />
        </div>
      </div>
    </div>
  )
}
