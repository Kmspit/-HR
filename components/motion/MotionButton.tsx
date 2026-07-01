'use client'

import { cn } from '@/lib/utils'

type Props = {
  children: React.ReactNode
  className?: string
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  onClick?: React.MouseEventHandler<HTMLButtonElement>
  style?: React.CSSProperties
}

const variants = {
  primary: 'bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50',
  secondary:
    'border border-slate-300 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5',
  danger: 'bg-red-600 text-white hover:bg-red-500 disabled:opacity-50',
  ghost: 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5',
}

const sizes = {
  sm: 'min-h-[36px] px-3 py-1.5 text-[13px] rounded-lg',
  md: 'min-h-[44px] px-4 py-2.5 text-[14px] rounded-xl',
  lg: 'min-h-[48px] px-5 py-3 text-[15px] rounded-xl',
}

export default function MotionButton({
  className,
  variant = 'primary',
  size = 'md',
  disabled,
  children,
  type = 'button',
  onClick,
  style,
}: Props) {
  return (
    <button
      type={type}
      onClick={onClick}
      style={style}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150',
        'active:scale-[0.97] disabled:active:scale-100',
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </button>
  )
}
