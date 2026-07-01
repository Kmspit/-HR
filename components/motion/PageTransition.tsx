'use client'

import { usePathname } from 'next/navigation'

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div key={pathname} className="page-enter min-h-0 flex-1 flex flex-col">
      {children}
    </div>
  )
}
