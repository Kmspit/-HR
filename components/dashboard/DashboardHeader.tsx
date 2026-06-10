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
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="absolute left-0 top-0 bottom-0 w-64 z-50 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <Sidebar user={user} onClose={() => setSidebarOpen(false)} />
          </div>
          <button
            className="absolute right-4 top-4 z-50 rounded-xl bg-white/90 p-2 text-slate-600 hover:text-slate-900 border border-slate-200 shadow-sm
              dark:bg-slate-800/90 dark:text-slate-400 dark:hover:text-white dark:border-white/10"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
      )}

      <header
        className="sticky top-0 z-30 flex h-16 items-center gap-3 px-4 md:px-6
          bg-white/95 border-b border-slate-200 shadow-sm backdrop-blur-[20px]
          dark:bg-[rgba(7,11,20,0.90)] dark:border-[rgba(255,255,255,0.06)] dark:shadow-none"
      >
        {/* Mobile menu */}
        <button
          onClick={() => setSidebarOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border transition-all md:hidden
            border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-sm
            dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-400 dark:hover:bg-white/[0.1] dark:hover:text-white"
          aria-label="เปิดเมนู"
        >
          <Menu size={18} />
        </button>

        <div className="flex-1 min-w-0 md:hidden">
          <p className="truncate text-[13.5px] font-bold text-[#1E3A5F] dark:text-white">
            เค เอ็ม เซอร์วิส พลัส
          </p>
        </div>

        {/* Desktop spacer */}
        <div className="hidden md:block flex-1" />

        {/* Actions */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <NotificationBell initialCount={unreadCount} />
          <UserMenu user={user} />
        </div>
      </header>
    </>
  )
}
