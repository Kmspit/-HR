'use client'

import Link from 'next/link'
import NavLink from './NavLink'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { Role } from '@prisma/client'
import { useState, useEffect, useCallback } from 'react'

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
  dashboard:    'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  calendar:     'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  attendance:   'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  leave:        'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  outside:      'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z',
  plan:         'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  employees:    'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  payroll:      'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  payslip:      'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  approvals:    'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  warnings:     'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  rules:        'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  announce:     'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z',
  lineoa:       'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  notif:        'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
  settings:     'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  tasks:        'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  performance:  'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  casedocs:     'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2zM9 13h6m-6 4h6m2-10H9',
  clients:      'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v2h5m0-2v-2c0-.656.126-1.283.356-1.857M7 20v2m7-13a4 4 0 11-8 0 4 4 0 018 0zm6 2a3 3 0 11-6 0 3 3 0 016 0z',
  ai:           'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z M9 10h.01M12 10h.01M15 10h.01',
  finance:      'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  claim:        'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 8l2 2 4-4',
  debt:         'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
  followup:     'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  calendar2:    'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  building:     'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  contract:     'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  history:      'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  invoice:      'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 8h6m-6 4h3',
  receipt:      'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  billing:      'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
  approvalctr:  'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z',
  knowledge:    'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  courtcal:     'M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3',
  recovery:     'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  cases:        'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z M15 3v4a1 1 0 001 1h4',
  appt:         'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z M9 14h.01M12 14h.01M15 14h.01M9 17h.01M12 17h.01M15 17h.01',
  sop:          'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  training:     'M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222',
  security:     'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  automation:   'M13 10V3L4 14h7v7l9-11h-7z',
  executive:    'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  chevronLeft:  'M15 19l-7-7 7-7',
  chevronRight: 'M9 5l7 7-7 7',
  chevronDown:  'M19 9l-7 7-7-7',
  close:        'M6 18L18 6M6 6l12 12',
}

type NavItem = { href: string; icon: keyof typeof ICONS; label: string; roles?: Role[]; badge?: string }

/* ── 7 sections (consolidated from 11) ─────────────────────────────────────── */
const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'หลัก',
    items: [
      { href: '/dashboard', icon: 'dashboard', label: 'แดชบอร์ด' },
      { href: '/executive',  icon: 'executive', label: 'CEO Command Center', roles: ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER'] as Role[] },
    ],
  },
  {
    title: 'เวลา & ลา',
    items: [
      { href: '/attendance',         icon: 'attendance', label: 'ลงเวลางาน' },
      { href: '/attendance/monthly', icon: 'calendar',   label: 'บันทึกรายเดือน' },
      { href: '/calendar',           icon: 'calendar',   label: 'ปฏิทิน' },
      { href: '/leave',              icon: 'leave',      label: 'ขอลาหยุด' },
      { href: '/outside-work',       icon: 'outside',    label: 'ออกนอกสถานที่' },
      { href: '/forgot-scan',        icon: 'attendance', label: 'แก้ไขเวลาลงงาน' },
      { href: '/weekly-plan',        icon: 'plan',       label: 'แผนงานสัปดาห์',    roles: ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'LAWYER', 'MANAGER', 'TEAM_LEADER'] as Role[] },
      { href: '/attendance/scans',   icon: 'attendance', label: 'ประวัติสแกนใบหน้า', roles: ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER'] as Role[] },
    ],
  },
  {
    title: 'งาน & ผลงาน',
    items: [
      { href: '/ai-assistant', icon: 'ai',          label: 'AI Assistant' },
      { href: '/tasks',        icon: 'tasks',       label: 'มอบหมายงาน' },
      { href: '/performance',  icon: 'performance', label: 'KPI / ผลงาน' },
      { href: '/knowledge',    icon: 'knowledge',   label: 'คลังความรู้' },
      { href: '/sop',          icon: 'sop',         label: 'SOP ขั้นตอนงาน' },
      { href: '/training',     icon: 'training',    label: 'Training & Quiz' },
    ],
  },
  {
    title: 'คดี & ลูกค้า',
    items: [
      { href: '/cases',                icon: 'cases',     label: 'คดีความ' },
      { href: '/case-documents',       icon: 'casedocs',  label: 'เอกสารคดี' },
      { href: '/clients',              icon: 'clients',   label: 'จัดการลูกค้า',   roles: ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER'] as Role[] },
      { href: '/debtors',              icon: 'debt',      label: 'รายชื่อลูกหนี้' },
      { href: '/debt-followup',        icon: 'followup',  label: 'ติดตามหนี้' },
      { href: '/payment-appointments', icon: 'calendar2', label: 'นัดชำระ' },
      { href: '/court-calendar',       icon: 'courtcal',  label: 'นัดศาล' },
      { href: '/appointments',         icon: 'appt',      label: 'นัดหมาย' },
      { href: '/client-companies',     icon: 'building',  label: 'ลูกค้าองค์กร',   roles: ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER'] as Role[] },
      { href: '/contracts',            icon: 'contract',  label: 'สัญญา',           roles: ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER'] as Role[] },
      { href: '/client-history',       icon: 'history',   label: 'ประวัติลูกค้า',   roles: ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER'] as Role[] },
    ],
  },
  {
    title: 'การเงิน',
    items: [
      { href: '/recovery',      icon: 'recovery', label: 'Recovery & Collection', roles: ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER', 'LAWYER', 'ENFORCEMENT'] as Role[] },
      { href: '/case-finance',  icon: 'finance',  label: 'การเงินคดี',    roles: ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER'] as Role[] },
      { href: '/expense-claim', icon: 'claim',    label: 'เบิกค่าใช้จ่าย' },
      { href: '/billing',       icon: 'billing',  label: 'วางบิล',        roles: ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN'] as Role[] },
      { href: '/invoices',      icon: 'invoice',  label: 'ใบแจ้งหนี้',    roles: ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN'] as Role[] },
      { href: '/receipts',      icon: 'receipt',  label: 'ใบเสร็จ',       roles: ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN'] as Role[] },
    ],
  },
  {
    title: 'บุคคล & HR',
    items: [
      { href: '/approval-center', icon: 'approvalctr', label: 'ศูนย์อนุมัติ',       roles: ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER'] as Role[] },
      { href: '/approvals',       icon: 'approvals',   label: 'อนุมัติ',             roles: ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER'] as Role[] },
      { href: '/employees',       icon: 'employees',   label: 'พนักงาน',             roles: ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER'] as Role[] },
      { href: '/payroll',         icon: 'payroll',     label: 'เงินเดือน',           roles: ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR'] as Role[] },
      { href: '/payslip',         icon: 'payslip',     label: 'สลิปเงินเดือน' },
      { href: '/reports',         icon: 'calendar',    label: 'รายงานรายเดือน',      roles: ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER'] as Role[] },
      { href: '/probation',       icon: 'plan',        label: 'ประเมินทดลองงาน',     roles: ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'MANAGER'] as Role[] },
      { href: '/documents',       icon: 'plan',        label: 'ขอเอกสาร' },
      { href: '/warnings',        icon: 'warnings',    label: 'ใบเตือน' },
      { href: '/rules',           icon: 'rules',       label: 'กฎระเบียบ' },
      { href: '/branches',        icon: 'settings',    label: 'จัดการสาขา',          roles: ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN'] as Role[] },
      { href: '/organization',    icon: 'employees',   label: 'ฝ่าย/แผนก/ส่วนงาน',  roles: ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN'] as Role[] },
    ],
  },
  {
    title: 'ระบบ',
    items: [
      { href: '/automation',    icon: 'automation', label: 'Automation Rules', roles: ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN'] as Role[] },
      { href: '/settings',      icon: 'settings', label: 'ตั้งค่า',        roles: ['CEO', 'MANAGER_HR', 'ADMIN'] as Role[] },
      { href: '/security',      icon: 'security', label: 'ความปลอดภัย',   roles: ['CEO', 'SUPER_ADMIN', 'HR', 'MANAGER_HR'] as Role[] },
      { href: '/announcements', icon: 'announce', label: 'ประกาศ',         roles: ['CEO', 'MANAGER_HR', 'ADMIN', 'EMPLOYEE', 'LAWYER'] as Role[] },
      { href: '/line-oa',       icon: 'lineoa',   label: 'LINE OA',        roles: ['CEO', 'MANAGER_HR', 'ADMIN'] as Role[] },
      { href: '/notifications', icon: 'notif',    label: 'แจ้งเตือน',     roles: ['CEO', 'MANAGER_HR', 'ADMIN', 'EMPLOYEE', 'LAWYER'] as Role[] },
    ],
  },
]

type Props = {
  user: { name: string; email: string; role: Role; department: string | null }
  onClose?: () => void
}

function SidebarContent({
  user,
  collapsed,
  pathname,
  openSections,
  onToggleSection,
  onToggleCollapsed,
  onClose,
}: {
  user: Props['user']
  collapsed: boolean
  pathname: string
  openSections: Record<string, boolean>
  onToggleSection: (t: string) => void
  onToggleCollapsed?: () => void
  onClose?: () => void
}) {
  const filteredSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.roles || item.roles.includes(user.role)),
  })).filter((s) => s.items.length > 0)

  return (
    <>
      {/* Logo */}
      <div className={cn('flex items-center py-4 px-3', collapsed ? 'justify-center' : 'justify-between')}>
        <Link
          href="/dashboard"
          onClick={onClose}
          className={cn('flex items-center gap-3 hover:opacity-90 transition-opacity min-w-0', collapsed && 'gap-0')}
        >
          <div
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg,#1E3A5F 0%,#3B82F6 100%)', boxShadow: '0 2px 12px rgba(30,58,95,0.25)' }}
          >
            HR
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-[12px] font-extrabold tracking-tight text-[#1E3A5F] dark:text-white leading-tight">
                เค เอ็ม <span className="gradient-text-blue">เซอร์วิส</span> พลัส
              </div>
              <div className="text-[9px] text-slate-400 leading-tight">จำกัด</div>
            </div>
          )}
        </Link>
        {!collapsed && onToggleCollapsed && (
          <button
            onClick={onToggleCollapsed}
            className="ml-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg
              dark:text-slate-500 dark:hover:bg-white/[0.08] dark:hover:text-slate-300
              text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            title="ย่อ sidebar"
          >
            <Icon d={ICONS.chevronLeft} className="h-3.5 w-3.5" />
          </button>
        )}
        {!collapsed && !onToggleCollapsed && onClose && (
          <button
            onClick={onClose}
            className="ml-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg
              dark:text-slate-500 dark:hover:bg-white/[0.08] dark:hover:text-slate-300
              text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            title="ปิดเมนู"
          >
            <Icon d={ICONS.close} className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="mx-3 h-px bg-slate-100 dark:bg-gradient-to-r dark:from-transparent dark:via-white/8 dark:to-transparent" />

      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 pt-4 pb-[max(env(safe-area-inset-bottom),1rem)] space-y-5">
        {filteredSections.map((section) => {
          const isOpen = collapsed || (openSections[section.title] !== false)
          return (
            <div key={section.title}>
              {!collapsed && (
                <button
                  onClick={() => onToggleSection(section.title)}
                  className="flex w-full items-center justify-between mb-2 px-2.5 rounded transition-colors
                    text-[9.5px] font-semibold uppercase tracking-[0.18em]
                    text-slate-500 hover:text-slate-700
                    dark:text-slate-600 dark:hover:text-slate-400"
                >
                  <span>{section.title}</span>
                  <Icon
                    d={isOpen ? ICONS.chevronDown : ICONS.chevronRight}
                    className="h-3 w-3 transition-transform duration-300"
                  />
                </button>
              )}
              {collapsed && <div className="mb-1 mx-1 h-px dark:bg-white/5 bg-slate-100" />}
              <div
                style={{
                  display: 'grid',
                  gridTemplateRows: isOpen ? '1fr' : '0fr',
                  transition: 'grid-template-rows 0.3s ease',
                }}
              >
                <div className="overflow-hidden">
                  <div className="space-y-0.5">
                    {section.items.map((item) => {
                      const active = pathname.startsWith(item.href)
                      return (
                        <div key={item.href} className="relative group/tip">
                          <NavLink
                            href={item.href}
                            onClick={onClose}
                            className={() => cn(
                              'nav-link-icon',
                              'group relative flex items-center rounded-xl py-2.5 text-[13px] transition-all duration-150',
                              collapsed ? 'justify-center px-2' : 'gap-3 px-3',
                              active
                                ? 'nav-active text-blue-700 dark:text-blue-300 font-semibold'
                                : 'text-slate-600 hover:bg-blue-50 hover:text-slate-900 dark:text-slate-500 dark:hover:bg-white/[0.04] dark:hover:text-slate-200',
                            )}
                          >
                            {!collapsed && (
                              <span className={cn(
                                'absolute left-0 h-7 w-0.5 rounded-r-full transition-all',
                                active ? 'bg-blue-600 dark:bg-blue-500 opacity-100' : 'opacity-0',
                              )} />
                            )}
                            <Icon
                              d={ICONS[item.icon] ?? ICONS.dashboard}
                              className={cn('h-4 w-4', active
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-slate-500 group-hover:text-slate-700 dark:text-slate-500 dark:group-hover:text-slate-300'
                              )}
                            />
                            {!collapsed && (
                              <>
                                <span className="flex-1 leading-none">{item.label}</span>
                                {item.badge && (
                                  <span className="flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                                    {item.badge}
                                  </span>
                                )}
                              </>
                            )}
                          </NavLink>
                          {collapsed && (
                            <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50
                              whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium
                              dark:bg-slate-800 dark:text-white dark:shadow-lg dark:ring-1 dark:ring-white/10
                              bg-slate-900 text-white shadow-xl
                              opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150">
                              {item.label}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </nav>

      {collapsed && onToggleCollapsed && (
        <div className="px-2 py-3 border-t dark:border-white/5 border-slate-100">
          <button
            onClick={onToggleCollapsed}
            className="flex w-full h-8 items-center justify-center rounded-lg
              dark:text-slate-500 dark:hover:bg-white/[0.08] dark:hover:text-slate-300
              text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            title="ขยาย sidebar"
          >
            <Icon d={ICONS.chevronRight} className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </>
  )
}

export default function Sidebar({ user }: Props) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () => Object.fromEntries(NAV_SECTIONS.map(s => [s.title, true]))
  )

  useEffect(() => {
    try {
      const stored = localStorage.getItem('sidebar-collapsed')
      if (stored === 'true') setCollapsed(true)
    } catch {}
    try {
      const stored = localStorage.getItem('sidebar-sections')
      if (stored) setOpenSections(JSON.parse(stored))
    } catch {}
  }, [])

  useEffect(() => {
    const handleOpen = () => setMobileOpen(true)
    window.addEventListener('hrflow:open-sidebar', handleOpen)
    return () => window.removeEventListener('hrflow:open-sidebar', handleOpen)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // Body scroll lock — prevents background scroll on iOS Safari while drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try { localStorage.setItem('sidebar-collapsed', String(next)) } catch {}
      return next
    })
  }, [])

  const toggleSection = useCallback((title: string) => {
    setOpenSections(prev => {
      const next = { ...prev, [title]: !prev[title] }
      try { localStorage.setItem('sidebar-sections', JSON.stringify(next)) } catch {}
      return next
    })
  }, [])

  const closeMobile = useCallback(() => setMobileOpen(false), [])

  const sharedProps = { user, pathname, openSections, onToggleSection: toggleSection }

  return (
    <>
      {/* ── Mobile drawer ── */}
      {mobileOpen && (
        <div className="md:hidden">
          {/* Backdrop — z-[55] sits above header (z-50) and MobileNav (z-50) */}
          <div
            className="fixed inset-0 z-[55] bg-black/60 backdrop-blur-sm animate-[fadeIn_0.15s_ease]"
            onClick={closeMobile}
            aria-hidden
          />
          {/* Drawer — z-[60] sits above backdrop */}
          <div className="fixed left-0 top-0 h-full z-[60] w-72 flex flex-col overflow-hidden
            bg-white dark:bg-[#0d1424] shadow-2xl
            animate-[slideInLeft_0.22s_cubic-bezier(0.25,0.46,0.45,0.94)]">
            <SidebarContent
              {...sharedProps}
              collapsed={false}
              onClose={closeMobile}
            />
          </div>
        </div>
      )}

      {/* ── Desktop sidebar ── */}
      <aside
        className={cn(
          'hidden md:flex shrink-0 h-full flex-col overflow-hidden transition-[width] duration-300 ease-in-out',
          collapsed ? 'w-14' : 'w-60',
          'bg-white border-r border-slate-200/80 shadow-sm',
          'dark:[background:linear-gradient(180deg,#0d1424_0%,#0a0f1e_100%)] dark:border-r dark:border-white/[0.05] dark:shadow-none',
        )}
      >
        <SidebarContent
          {...sharedProps}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
        />
      </aside>
    </>
  )
}
