'use client'

import Link from 'next/link'
import NavLink from './NavLink'
import { usePathname } from 'next/navigation'
import { cn, getInitials } from '@/lib/utils'
import { ROLE_LABELS, ROLE_ICONS } from '@/lib/permissions'
import type { Role } from '@prisma/client'

/* ── SVG Icon components ── */
const Icon = ({ d, className }: { d: string; className?: string }) => (
  <svg
    width={18}
    height={18}
    className={cn('hr-icon h-4.5 w-4.5 flex-shrink-0', className)}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.75}
    aria-hidden
  >
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
)

const ICONS: Record<string, string> = {
  dashboard:   'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  calendar:    'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  attendance:  'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  leave:       'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  outside:     'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z',
  plan:        'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  employees:   'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  payroll:     'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  payslip:     'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  approvals:   'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  warnings:    'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  rules:       'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  announce:    'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z',
  notif:       'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
  settings:    'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  logout:      'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
}

type NavItem = { href: string; icon: keyof typeof ICONS; label: string; roles?: Role[]; badge?: string }

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'หลัก',
    items: [
      { href: '/dashboard', icon: 'dashboard', label: 'แดชบอร์ด' },
    ],
  },
  {
    title: 'การทำงาน',
    items: [
      { href: '/attendance',   icon: 'attendance', label: 'ลงเวลางาน',       roles: ['MANAGER_HR', 'ADMIN', 'EMPLOYEE', 'LAWYER'] },
      { href: '/calendar',     icon: 'calendar',   label: 'ปฏิทิน',           roles: ['MANAGER_HR', 'ADMIN', 'EMPLOYEE', 'LAWYER'] },
      { href: '/leave',        icon: 'leave',       label: 'ขอลาหยุด',        roles: ['MANAGER_HR', 'ADMIN', 'EMPLOYEE', 'LAWYER'] },
      { href: '/outside-work', icon: 'outside',     label: 'ออกนอกสถานที่',   roles: ['MANAGER_HR', 'ADMIN', 'EMPLOYEE', 'LAWYER'] },
      { href: '/weekly-plan',  icon: 'plan',        label: 'แผนงานสัปดาห์',   roles: ['MANAGER_HR', 'LAWYER'] },
    ],
  },
  {
    title: 'HR จัดการ',
    items: [
      { href: '/employees', icon: 'employees', label: 'พนักงาน',       roles: ['MANAGER_HR', 'ADMIN'] },
      { href: '/branches',      icon: 'settings',  label: 'จัดการสาขา',       roles: ['MANAGER_HR', 'ADMIN'] },
      { href: '/organization', icon: 'employees', label: 'ฝ่าย/แผนก/ส่วนงาน', roles: ['MANAGER_HR', 'ADMIN'] },
      { href: '/payroll',   icon: 'payroll',   label: 'เงินเดือน',     roles: ['MANAGER_HR'] },
      { href: '/reports',   icon: 'calendar',  label: 'รายงานรายเดือน', roles: ['MANAGER_HR', 'ADMIN'] },
      { href: '/payslip',   icon: 'payslip',   label: 'สลิปเงินเดือน', roles: ['MANAGER_HR', 'ADMIN', 'EMPLOYEE', 'LAWYER'] },
      { href: '/approvals', icon: 'approvals', label: 'อนุมัติ',        roles: ['MANAGER_HR', 'ADMIN'] },
      { href: '/warnings',  icon: 'warnings',  label: 'ใบเตือน',        roles: ['MANAGER_HR', 'ADMIN', 'EMPLOYEE', 'LAWYER'] },
      { href: '/rules',     icon: 'rules',     label: 'กฎระเบียบ',      roles: ['MANAGER_HR', 'ADMIN', 'EMPLOYEE', 'LAWYER'] },
    ],
  },
  {
    title: 'สื่อสาร',
    items: [
      { href: '/announcements', icon: 'announce', label: 'ประกาศ',    roles: ['MANAGER_HR', 'ADMIN', 'EMPLOYEE', 'LAWYER'] },
      { href: '/notifications', icon: 'notif',    label: 'แจ้งเตือน', roles: ['MANAGER_HR', 'ADMIN', 'EMPLOYEE', 'LAWYER'] },
    ],
  },
  {
    title: 'ระบบ',
    items: [
      { href: '/settings', icon: 'settings', label: 'ตั้งค่า', roles: ['MANAGER_HR', 'ADMIN'] },
    ],
  },
]

type Props = {
  user: { name: string; email: string; role: Role; department: string | null }
  onClose?: () => void
}

export default function Sidebar({ user, onClose }: Props) {
  const pathname = usePathname()

  const filteredSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.roles || item.roles.includes(user.role)),
  })).filter((s) => s.items.length > 0)

  return (
    <aside className="flex h-full w-56 flex-col
      dark:[background:linear-gradient(180deg,#0d1424_0%,#0a0f1e_100%)] dark:[border-right:1px_solid_rgba(255,255,255,0.05)]
      light:bg-white light:border-r light:border-slate-200 light:shadow-sm"
    >
      {/* Logo */}
      <Link href="/dashboard" className="flex items-center gap-3 px-5 py-5 hover:opacity-90 transition-opacity">
        <div
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
          style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)', boxShadow: '0 0 20px rgba(99,102,241,0.35)' }}
        >
          HR
        </div>
        <div>
          <div className="text-[12px] font-extrabold tracking-tight text-white leading-tight">
            เค เอ็ม <span className="gradient-text-blue">เซอร์วิส</span> พลัส
          </div>
          <div className="text-[9px] text-slate-500 leading-tight">จำกัด</div>
        </div>
      </Link>

      {/* Divider */}
      <div className="mx-4 h-px dark:bg-gradient-to-r dark:from-transparent dark:via-white/8 dark:to-transparent light:bg-slate-100" />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {filteredSections.map((section) => (
          <div key={section.title}>
            <p className="mb-2 px-2.5 text-[9.5px] font-semibold uppercase tracking-[0.18em] dark:text-slate-600 light:text-slate-400">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname.startsWith(item.href)
                return (
                <NavLink
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={() => cn(
                    'nav-link-icon',
                    'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-150',
                    active
                      ? 'nav-active dark:text-blue-300 light:text-blue-600 font-semibold'
                      : 'dark:text-slate-500 dark:hover:bg-white/[0.04] dark:hover:text-slate-200 light:text-slate-500 light:hover:bg-slate-50 light:hover:text-slate-800',
                  )}
                >
                  <span className={cn(
                    'absolute left-0 h-7 w-0.5 rounded-r-full transition-all',
                    active ? 'bg-blue-500 opacity-100' : 'opacity-0',
                  )} />
                  <Icon
                    d={ICONS[item.icon] ?? ICONS.dashboard}
                    className={cn('h-4 w-4', active
                      ? 'dark:text-blue-400 light:text-blue-600'
                      : 'dark:text-slate-500 dark:group-hover:text-slate-300 light:text-slate-400 light:group-hover:text-slate-700'
                    )}
                  />
                  <span className="flex-1 leading-none">{item.label}</span>
                  {item.badge && (
                    <span className="flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                      {item.badge}
                    </span>
                  )}
                </NavLink>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User card — info only; logout is in top header */}
      <div className="p-3">
        <div className="mx-4 h-px dark:bg-gradient-to-r dark:from-transparent dark:via-white/6 dark:to-transparent light:bg-slate-100 mb-3" />
        <div className="flex items-center gap-2.5 rounded-xl p-2.5 dark:bg-white/[0.03] light:bg-slate-50">
          <div
            className="flex h-8.5 w-8.5 flex-shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)' }}
          >
            {getInitials(user.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold dark:text-slate-200 light:text-slate-800 leading-tight">{user.name}</p>
            <p className="truncate text-[10px] dark:text-slate-500 light:text-slate-400 mt-0.5">{ROLE_ICONS[user.role]} {ROLE_LABELS[user.role]}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
