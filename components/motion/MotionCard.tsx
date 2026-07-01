'use client'

import { motion, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { cardHover, cardTap } from '@/lib/motion-presets'

type BaseProps = {
  children: React.ReactNode
  className?: string
  interactive?: boolean
}

type DivProps = BaseProps & { href?: undefined; onClick?: () => void }

type LinkProps = BaseProps & { href: string }

type Props = DivProps | LinkProps

const cardClass =
  'rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 shadow-sm transition-shadow duration-200 ease-out hover:shadow-md dark:hover:shadow-black/20'

export default function MotionCard(props: Props) {
  const reduced = useReducedMotion()
  const hover = reduced || props.interactive === false ? undefined : cardHover
  const tap = reduced || props.interactive === false ? undefined : cardTap

  if ('href' in props && props.href) {
    const { href, children, className } = props
    return (
      <motion.div whileHover={hover} whileTap={tap} className="h-full">
        <Link href={href} className={cn(cardClass, 'block h-full p-4', className)}>
          {children}
        </Link>
      </motion.div>
    )
  }

  const { children, className, onClick } = props as DivProps
  return (
    <motion.div
      whileHover={hover}
      whileTap={tap}
      onClick={onClick}
      className={cn(cardClass, 'p-4', className)}
    >
      {children}
    </motion.div>
  )
}

/** Summary / gradient stat card used on HR admin dashboard */
export function MotionSummaryCard({
  href,
  children,
  className,
}: {
  href: string
  children: React.ReactNode
  className?: string
}) {
  const reduced = useReducedMotion()
  const hover = reduced ? undefined : { y: -2, transition: { duration: 0.15 } }
  const tap = reduced ? undefined : cardTap

  return (
    <motion.div whileHover={hover} whileTap={tap}>
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
    </motion.div>
  )
}

/** Quick-action tile in employee / approver dashboards */
export function MotionQuickLink({
  href,
  children,
  className,
}: {
  href: string
  children: React.ReactNode
  className?: string
}) {
  const reduced = useReducedMotion()
  const hover = reduced ? undefined : { y: -2, transition: { duration: 0.14 } }
  const tap = reduced ? undefined : cardTap

  return (
    <motion.div whileHover={hover} whileTap={tap} className="h-full">
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
    </motion.div>
  )
}
