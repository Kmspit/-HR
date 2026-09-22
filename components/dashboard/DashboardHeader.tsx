'use client'

import { Menu } from 'lucide-react'
import UserMenu from './UserMenu'
import NotificationBell from './NotificationBell'
import { ThemeToggle } from '@/components/ThemeToggle'
import type { Role } from '@prisma/client'

type Props = {
  user: { name: string; email: string; role: Role; department: string | null; avatarUrl?: string | null }
  unreadCount?: number
}

export default function DashboardHeader({ user, unreadCount = 0 }: Props) {
  return (
    <header
      // pt-[env(safe-area-inset-top,0px)] — sticky top-0 otherwise renders
      // its content flush against the very top of the screen, under the
      // phone's status bar/notch on devices that report a safe-area inset
      // (confirmed via a real screenshot, 2026-09-22). min-h-16 (not h-16)
      // so the extra top padding grows the header instead of squeezing its
      // already-centered content into a fixed height. Same env()-with-
      // fallback pattern Sidebar.tsx already uses for its bottom edge.
      className="sticky top-0 z-40 flex min-h-16 items-center gap-3 px-4 md:px-6
        pt-[env(safe-area-inset-top,0px)]
        bg-white dark:bg-[rgba(7,11,20,0.98)] border-b border-slate-200 shadow-sm
        md:bg-white/95 md:backdrop-blur-[20px] md:dark:bg-[rgba(7,11,20,0.90)]
        dark:border-[rgba(255,255,255,0.06)] dark:shadow-none"
    >
      {/* Mobile menu — delegates to Sidebar.tsx which owns the drawer */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('hrflow:open-sidebar'))}
        className="flex h-11 w-11 items-center justify-center rounded-xl border transition-all md:hidden
          border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-sm
          dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-400 dark:hover:bg-white/[0.1] dark:hover:text-white"
        aria-label="เปิดเมนู"
      >
        <Menu size={18} />
      </button>

      <div className="flex-1 min-w-0 md:hidden">
        <p className="truncate text-[13.5px] font-bold text-green-700 dark:text-white">
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
  )
}
