'use client'

import { useState, useEffect } from 'react'
import { Menu, X } from 'lucide-react'
import Sidebar from './Sidebar'
import UserMenu from './UserMenu'
import NotificationBell from './NotificationBell'
import { ThemeToggle } from '@/components/ThemeToggle'
import type { Role } from '@prisma/client'

type Props = {
  user: { name: string; email: string; role: Role; department: string | null }
  unreadCount?: number
}

export default function DashboardHeader({ user, unreadCount = 0 }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const open = () => setSidebarOpen(true)
    window.addEventListener('hrflow:open-sidebar', open)
    return () => window.removeEventListener('hrflow:open-sidebar', open)
  }, [])

  return (
    <>
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setSidebarOpen(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
          <div className="absolute left-0 top-0 bottom-0 w-60 z-50 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <Sidebar user={user} onClose={() => setSidebarOpen(false)} />
          </div>
          <button
            className="absolute right-4 top-4 z-50 rounded-xl bg-slate-800/90 p-2 text-slate-400 hover:text-white border border-white/10"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
      )}

      <header
        className="sticky top-0 z-30 flex h-14 items-center gap-3 px-4
          dark:[background:rgba(7,11,20,0.85)] dark:[border-bottom:1px_solid_rgba(255,255,255,0.05)]
          light:bg-white/90 light:border-b light:border-slate-200/80 light:shadow-sm
          backdrop-blur-[20px]"
      >
        {/* Mobile menu */}
        <button
          onClick={() => setSidebarOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border transition-all md:hidden
            dark:border-white/8 dark:bg-white/[0.04] dark:text-slate-400
            light:border-slate-200 light:bg-white light:text-slate-500 light:shadow-sm"
          aria-label="เปิดเมนู"
        >
          <Menu size={16} />
        </button>

        <div className="flex-1 min-w-0 md:hidden">
          <p className="truncate text-[13px] font-bold dark:text-white light:text-slate-800">
            เค เอ็ม เซอร์วิส พลัส
          </p>
        </div>

        {/* Desktop spacer */}
        <div className="hidden md:block flex-1" />

        {/* Actions — always top-right on every page */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <NotificationBell initialCount={unreadCount} />

          <UserMenu user={user} />
        </div>
      </header>
    </>
  )
}
