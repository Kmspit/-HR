'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  href: string
  onClick?: () => void
  className?: string | ((active: boolean) => string)
  children: React.ReactNode
  showSpinner?: boolean
}

export default function NavLink({ href, onClick, className, children, showSpinner = true }: Props) {
  const pathname = usePathname()
  const active = pathname.startsWith(href)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    setPending(false)
  }, [pathname])

  const resolvedClass = typeof className === 'function' ? className(active) : className

  return (
    <Link
      href={href}
      onClick={() => {
        if (!active) setPending(true)
        onClick?.()
      }}
      className={cn(resolvedClass, pending && 'opacity-75 pointer-events-none')}
    >
      {children}
      {showSpinner && pending && (
        <span className="ml-auto h-3.5 w-3.5 flex-shrink-0 rounded-full border-2 border-green-500/30 border-t-green-500 animate-spin" />
      )}
    </Link>
  )
}
