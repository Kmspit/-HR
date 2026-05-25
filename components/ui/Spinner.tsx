'use client'

import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = { sm: 14, md: 20, lg: 28 }

export default function Spinner({ size = 'md', className }: Props) {
  return (
    <Loader2
      size={sizes[size]}
      className={cn('animate-spin text-blue-500', className)}
      aria-hidden
    />
  )
}
