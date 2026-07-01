'use client'

import Link from 'next/link'
import { BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ManualButtonProps {
  /** e.g. 'leave', 'outside-work', 'attendance' */
  section?: string
  className?: string
}

export function ManualButton({ section, className }: ManualButtonProps) {
  const href = section ? `/manual?section=${encodeURIComponent(section)}` : '/manual'

  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-1 text-sm text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors',
        className,
      )}
    >
      <BookOpen className="w-4 h-4 flex-shrink-0" aria-hidden />
      <span>คู่มือ</span>
    </Link>
  )
}
