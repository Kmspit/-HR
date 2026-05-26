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
