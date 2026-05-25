'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { Role } from '@prisma/client'

const NAV_ICONS: Record<string, string> = {
  dashboard:  'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  attendance: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  leave:      'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  approvals:  'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  payslip:    'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  notif:      'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
  outside:    'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z',
}

const MOBILE_ITEMS: { href: string; icon: keyof typeof NAV_ICONS; label: string; roles?: Role[] }[] = [
  { href: '/dashboard',    icon: 'dashboard',  label: 'หน้าหลัก' },
  { href: '/attendance',   icon: 'attendance', label: 'เช็คอิน' },
  { href: '/leave',        icon: 'leave',      label: 'ลาหยุด' },
  { href: '/approvals',    icon: 'approvals',  label: 'อนุมัติ', roles: ['MANAGER_HR', 'ADMIN'] },
  { href: '/outside-work', icon: 'outside',    label: 'นอกที่' },
  { href: '/payslip',      icon: 'payslip',    label: 'สลิป' },
  { href: '/notifications',icon: 'notif',      label: 'แจ้ง' },
]

export default function MobileNav({ role }: { role: Role }) {
  const pathname = usePathname()
  const items = MOBILE_ITEMS.filter((i) => !i.roles || i.roles.includes(role)).slice(0, 5)

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Blur backdrop */}
      <div
        className="absolute inset-0 dark:[background:rgba(8,12,22,0.92)] light:[background:rgba(255,255,255,0.92)]"
        style={{ backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)' }}
      />
      {/* Top border */}
      <div className="absolute top-0 left-0 right-0 h-px dark:bg-white/[0.06] light:bg-slate-200" />

      <div className="relative flex items-stretch justify-around px-0.5 py-1.5">
        {items.map((item) => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative flex flex-1 flex-col items-center gap-0.5 rounded-xl px-0.5 pt-2 pb-1.5 transition-all duration-150 min-h-[50px] justify-center',
                active
                  ? 'dark:text-blue-400 light:text-blue-600'
                  : 'dark:text-slate-500 dark:active:text-slate-200 light:text-slate-400 light:active:text-slate-700',
              )}
            >
              {/* Active indicator */}
              {active && (
                <span className="absolute top-0.5 left-1/2 -translate-x-1/2 h-0.5 w-5 rounded-full dark:bg-blue-400 light:bg-blue-500" />
              )}

              {/* Icon */}
              <span className={cn(
                'flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-150',
                active ? 'dark:bg-blue-500/15 light:bg-blue-50' : '',
              )}>
                <svg
                  className={cn('h-4.5 w-4.5', active ? 'dark:text-blue-400 light:text-blue-600' : '')}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  strokeWidth={active ? 2.2 : 1.75}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d={NAV_ICONS[item.icon]} />
                </svg>
              </span>

              <span className={cn(
                'text-[9px] font-semibold leading-none',
                active ? 'dark:text-blue-400 light:text-blue-600' : 'dark:text-slate-500 light:text-slate-400',
              )}>
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
