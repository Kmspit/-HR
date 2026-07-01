'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'

type BaseProps = {
  children: React.ReactNode
  className?: string
  interactive?: boolean
}

type DivProps = BaseProps & { href?: undefined; onClick?: () => void }
type LinkProps = BaseProps & { href: string }
type Props = DivProps | LinkProps

const cardClass =
  'rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-200 ease-out hover:shadow-md dark:hover:shadow-black/20'

const motionClass = 'motion-card-interactive'

export default function MotionCard(props: Props) {
  const interactive = props.interactive !== false

  if ('href' in props && props.href) {
    const { href, children, className } = props
    return (
      <div className={cn(interactive && motionClass, 'h-full')}>
        <Link href={href} className={cn(cardClass, 'block h-full p-4', className)}>
          {children}
        </Link>
      </div>
    )
  }

  const { children, className, onClick } = props as DivProps
  return (
    <div
      onClick={onClick}
      className={cn(cardClass, interactive && motionClass, 'p-4', className)}
    >
      {children}
    </div>
  )
}

export function MotionSummaryCard({
  href,
  children,
  className,
}: {
  href: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={motionClass}>
      <Link
        href={href}
        className={cn(
          'group relative block overflow-hidden rounded-2xl bg-white dark:bg-slate-900 md:dark:bg-slate-900/60',
          'border border-slate-200 dark:border-white/[0.07] shadow-sm p-4',
          'transition-shadow duration-200 ease-out hover:shadow-md dark:hover:shadow-black/25',
          className,
        )}
      >
        {children}
      </Link>
    </div>
  )
}

export function MotionQuickLink({
  href,
  children,
  className,
}: {
  href: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn(motionClass, 'h-full')}>
      <Link
        href={href}
        className={cn(
          'flex h-full flex-col items-center gap-2.5 rounded-xl p-4 text-center',
          'border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]',
          'transition-colors duration-200 hover:border-slate-300 dark:hover:border-slate-700',
          className,
        )}
      >
        {children}
      </Link>
    </div>
  )
}
