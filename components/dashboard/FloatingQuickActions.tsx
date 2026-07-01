'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Plus, Clock, CalendarDays, MapPin, ClipboardCheck, type LucideIcon,
} from 'lucide-react'
import type { Role } from '@prisma/client'
import { canAccessApprovalCenter } from '@/lib/approval-center/access'
import { cn } from '@/lib/utils'

type ActionDef = {
  id: string
  href: string
  label: string
  sublabel: string
  icon: LucideIcon
  accent: string
  iconBg: string
  visible: (role: Role) => boolean
}

const ACTIONS: ActionDef[] = [
  {
    id: 'checkin',
    href: '/attendance',
    label: 'เช็คอิน',
    sublabel: 'บันทึกเข้างาน',
    icon: Clock,
    accent: 'hover:shadow-emerald-500/25',
    iconBg: 'bg-emerald-600 shadow-emerald-600/30',
    visible: () => true,
  },
  {
    id: 'leave',
    href: '/leave',
    label: 'ขอลาหยุด',
    sublabel: 'ส่งคำขอลา',
    icon: CalendarDays,
    accent: 'hover:shadow-blue-500/25',
    iconBg: 'bg-blue-600 shadow-blue-600/30',
    visible: () => true,
  },
  {
    id: 'outside',
    href: '/outside-work',
    label: 'ออกนอกสถานที่',
    sublabel: 'แจ้งงานนอกที่',
    icon: MapPin,
    accent: 'hover:shadow-violet-500/25',
    iconBg: 'bg-violet-600 shadow-violet-600/30',
    visible: () => true,
  },
  {
    id: 'approval',
    href: '/approval-center',
    label: 'ศูนย์อนุมัติ',
    sublabel: 'อนุมัติคำขอ',
    icon: ClipboardCheck,
    accent: 'hover:shadow-orange-500/25',
    iconBg: 'bg-orange-600 shadow-orange-600/30',
    visible: (role) => canAccessApprovalCenter(role),
  },
]

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.85, filter: 'blur(4px)' },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: { type: 'spring' as const, stiffness: 420, damping: 26 },
  },
  exit: {
    opacity: 0,
    y: 10,
    scale: 0.9,
    filter: 'blur(2px)',
    transition: { duration: 0.15 },
  },
}

type Props = { role: Role }

export default function FloatingQuickActions({ role }: Props) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const actions = useMemo(() => ACTIONS.filter((a) => a.visible(role)), [role])

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    close()
  }, [pathname, close])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close])

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.button
            type="button"
            aria-label="ปิดเมนูด่วน"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={close}
            className="fixed inset-0 z-[55] bg-slate-900/20 dark:bg-black/40 backdrop-blur-[2px] md:backdrop-blur-[3px]"
          />
        )}
      </AnimatePresence>

      <div
        className={cn(
          'fixed z-[60] hidden md:flex flex-col items-end gap-3',
          'bottom-6 right-6',
        )}
      >
        <AnimatePresence mode="popLayout">
          {open && (
            <motion.ul
              role="menu"
              aria-label="เมนูด่วน"
              variants={listVariants}
              initial="hidden"
              animate="show"
              exit="hidden"
              className="flex flex-col items-end gap-2.5 mb-1"
            >
              {actions.map((action) => {
                const Icon = action.icon
                return (
                  <motion.li key={action.id} variants={itemVariants} layout role="none">
                    <Link
                      href={action.href}
                      role="menuitem"
                      onClick={close}
                      className={cn(
                        'group flex items-center gap-3 rounded-2xl transition-shadow duration-200',
                        action.accent,
                      )}
                    >
                      <span
                        className={cn(
                          'rounded-xl px-3 py-2 text-right shadow-lg min-w-[120px]',
                          'bg-white/95 dark:bg-slate-900/95',
                          'border border-slate-200/80 dark:border-white/10',
                          'backdrop-blur-md',
                        )}
                      >
                        <span className="block text-[13px] font-bold text-slate-900 dark:text-white leading-tight">
                          {action.label}
                        </span>
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                          {action.sublabel}
                        </span>
                      </span>
                      <span
                        className={cn(
                          'flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl text-white shadow-lg',
                          'ring-2 ring-white/20 dark:ring-white/10',
                          'transition-transform duration-200 group-hover:scale-105 group-active:scale-95',
                          action.iconBg,
                        )}
                      >
                        <Icon className="h-5 w-5" strokeWidth={2.25} />
                      </span>
                    </Link>
                  </motion.li>
                )
              })}
            </motion.ul>
          )}
        </AnimatePresence>

        <motion.button
          type="button"
          aria-label={open ? 'ปิดเมนูด่วน' : 'เปิดเมนูด่วน'}
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((v) => !v)}
          whileTap={{ scale: 0.92 }}
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
          className={cn(
            'flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-xl',
            'bg-gradient-to-br from-[#1E3A5F] to-blue-700',
            'ring-2 ring-white/30 dark:ring-white/15',
            'hover:shadow-2xl hover:shadow-blue-600/30',
            'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/40',
            'transition-shadow duration-300',
          )}
        >
          <Plus className="h-6 w-6" strokeWidth={2.5} />
        </motion.button>
      </div>
    </>
  )
}
