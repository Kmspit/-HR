'use client'

import { useState, useRef, useEffect } from 'react'
import { Menu, X, Bell, LogOut, User } from 'lucide-react'
import { signOut } from 'next-auth/react'
import Sidebar from './Sidebar'
import type { Role } from '@prisma/client'
import { getInitials } from '@/lib/utils'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ROLE_LABELS, ROLE_ICONS } from '@/lib/permissions'

type Props = {
  title: string
  subtitle?: string
  user: { name: string; email: string; role: Role; department: string | null }
  actions?: React.ReactNode
}

export default function Topbar({ title, subtitle, user, actions }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [menuOpen, setMenuOpen]       = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
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

          {/* User avatar + dropdown */}
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-[11px] font-bold text-white transition-all active:scale-95"
              style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)', boxShadow: menuOpen ? '0 0 0 2px rgba(99,102,241,0.5)' : 'none' }}
            >
              {getInitials(user.name)}
            </button>

            {/* Dropdown */}
            {menuOpen && (
              <div className="absolute right-0 top-10 z-50 w-52 rounded-2xl border py-1.5 shadow-2xl
                dark:bg-[#0d1424] dark:border-white/10
                light:bg-white light:border-slate-200"
              >
                {/* User info */}
                <div className="px-4 py-2.5 border-b dark:border-white/8 light:border-slate-100">
                  <p className="text-[13px] font-semibold truncate dark:text-white light:text-slate-800">{user.name}</p>
                  <p className="text-[11px] truncate dark:text-slate-400 light:text-slate-500 mt-0.5">{user.email}</p>
                  <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full
                    dark:bg-blue-500/15 dark:text-blue-400 light:bg-blue-50 light:text-blue-600">
                    {ROLE_ICONS[user.role]} {ROLE_LABELS[user.role]}
                  </span>
                </div>

                {/* Menu items */}
                <div className="py-1 px-1.5">
                  <button
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] transition-all
                      dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-slate-200
                      light:text-slate-600 light:hover:bg-slate-50 light:hover:text-slate-800"
                    onClick={() => { setMenuOpen(false) }}
                  >
                    <User size={14} />
                    โปรไฟล์ของฉัน
                  </button>

                  <div className="my-1 h-px dark:bg-white/[0.06] light:bg-slate-100" />

                  <button
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all
                      dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300
                      light:text-red-500 light:hover:bg-red-50 light:hover:text-red-600"
                    onClick={() => signOut({ callbackUrl: '/' })}
                  >
                    <LogOut size={14} />
                    ออกจากระบบ
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  )
}
