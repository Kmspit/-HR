'use client'

import { useState } from 'react'
import { Menu, X, Bell } from 'lucide-react'
import Sidebar from './Sidebar'
import type { Role } from '@prisma/client'
import { getInitials } from '@/lib/utils'
import { ThemeToggle } from '@/components/ThemeToggle'

type Props = {
  title: string
  subtitle?: string
  user: { name: string; email: string; role: Role; department: string | null }
  actions?: React.ReactNode
}

export default function Topbar({ title, subtitle, user, actions }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

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

      {/* Topbar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 px-4
        dark:[background:rgba(7,11,20,0.85)] dark:[border-bottom:1px_solid_rgba(255,255,255,0.05)]
        light:bg-white/90 light:border-b light:border-slate-200/80 light:shadow-sm
        backdrop-blur-[20px] [backdrop-filter:blur(20px)_saturate(180%)]"
      >
        {/* Mobile menu button */}
        <button
          onClick={() => setSidebarOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border transition-all md:hidden
            dark:border-white/8 dark:bg-white/[0.04] dark:text-slate-400 dark:hover:border-white/15 dark:hover:text-white
            light:border-slate-200 light:bg-white light:text-slate-500 light:hover:border-slate-300 light:hover:text-slate-800 light:shadow-sm"
        >
          <Menu size={16} />
        </button>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <h1 className="truncate text-[13px] sm:text-[14px] font-bold dark:text-white light:text-slate-800 leading-tight">{title}</h1>
          {subtitle && <p className="hidden sm:block text-[11px] text-slate-500 truncate leading-none mt-0.5">{subtitle}</p>}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          {actions}

          {/* Theme toggle */}
          <ThemeToggle />

          {/* Notification bell */}
          <button className="relative flex h-8.5 w-8.5 items-center justify-center rounded-xl border transition-all
            dark:border-white/8 dark:bg-white/[0.03] dark:text-slate-400 dark:hover:border-white/15 dark:hover:text-white
            light:border-slate-200 light:bg-white light:text-slate-500 light:hover:border-slate-300 light:hover:text-slate-800 light:shadow-sm"
          >
            <Bell size={15} />
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-500 text-[8px] font-bold text-white">
              3
            </span>
          </button>

          {/* User avatar */}
          <div
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-[11px] font-bold text-white cursor-default"
            style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)' }}
          >
            {getInitials(user.name)}
          </div>
        </div>
      </header>
    </>
  )
}
