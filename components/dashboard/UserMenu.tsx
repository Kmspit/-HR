'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { LogOut, User, ChevronDown } from 'lucide-react'
import type { Role } from '@prisma/client'
import { getInitials } from '@/lib/utils'
import { ROLE_LABELS, ROLE_ICONS } from '@/lib/access-control'
import { useLoading } from '@/components/LoadingProvider'
import Spinner from '@/components/ui/Spinner'

type Props = {
  user: { name: string; email: string; role: Role }
  showName?: boolean
}

export default function UserMenu({ user, showName = true }: Props) {
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const mounted = useRef(true)
  const { showLoading, hideLoading } = useLoading()

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      mounted.current = false
    }
  }, [])

  async function handleSignOut() {
    setSigningOut(true)
    setOpen(false)
    showLoading('กำลังออกจากระบบ...')
    try {
      await signOut({ callbackUrl: '/' })
    } finally {
      // On successful redirect the component unmounts before finally runs.
      // Guard prevents setState on an unmounted component.
      // On error the component is still mounted — UI resets so the user can retry.
      if (mounted.current) {
        hideLoading()
        setSigningOut(false)
      }
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={signingOut}
        className="flex items-center gap-2 rounded-xl px-1.5 py-1 transition-all active:scale-[0.98] disabled:opacity-70
          dark:hover:bg-white/[0.06] light:hover:bg-slate-100"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-[11px] font-bold text-white"
          style={{
            background: 'linear-gradient(135deg, #22c55e 0%, #8b5cf6 100%)',
            boxShadow: open ? '0 0 0 2px rgba(99,102,241,0.45)' : 'none',
          }}
        >
          {signingOut ? <Spinner size="sm" className="text-white" /> : getInitials(user.name)}
        </div>
        {showName && (
          <div className="hidden md:block min-w-0 text-left">
            <p className="max-w-[120px] truncate text-[12px] font-semibold leading-tight dark:text-slate-200 light:text-slate-800">
              {user.name}
            </p>
            <p className="text-[12px] leading-tight dark:text-slate-500 light:text-slate-500">
              {ROLE_ICONS[user.role]} {ROLE_LABELS[user.role]}
            </p>
          </div>
        )}
        <ChevronDown
          size={14}
          className={`hidden md:block transition-transform dark:text-slate-500 light:text-slate-400 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-56 rounded-2xl border py-1.5 shadow-2xl
            dark:bg-[#0d1424] dark:border-white/10 light:bg-white light:border-slate-200
            animate-fade-in"
          role="menu"
        >
          <div className="px-4 py-2.5 border-b dark:border-white/8 light:border-slate-100">
            <p className="text-[13px] font-semibold truncate dark:text-white light:text-slate-800">{user.name}</p>
            <p className="text-[11px] truncate dark:text-slate-400 light:text-slate-500 mt-0.5">{user.email}</p>
            <span className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium px-2 py-0.5 rounded-full
              dark:bg-green-500/15 dark:text-green-400 light:bg-green-50 light:text-green-600">
              {ROLE_ICONS[user.role]} {ROLE_LABELS[user.role]}
            </span>
          </div>

          <div className="py-1 px-1.5">
            <Link
              href="/profile"
              role="menuitem"
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] transition-all
                dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-slate-200
                light:text-slate-600 light:hover:bg-slate-50 light:hover:text-slate-800"
              onClick={() => setOpen(false)}
            >
              <User size={14} />
              โปรไฟล์ของฉัน
            </Link>

            <div className="my-1 h-px dark:bg-white/[0.06] light:bg-slate-100" />

            <button
              role="menuitem"
              disabled={signingOut}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-all disabled:opacity-60
                dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300
                light:text-red-500 light:hover:bg-red-50 light:hover:text-red-600"
              onClick={handleSignOut}
            >
              {signingOut ? <Spinner size="sm" className="text-red-400" /> : <LogOut size={14} />}
              {signingOut ? 'กำลังออกจากระบบ...' : 'ออกจากระบบ'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
