import type { NotificationType } from '@prisma/client'
import type { NotificationPriority, NotificationTab } from './types'

export const TAB_LABELS: Record<NotificationTab, string> = {
  all: 'ทั้งหมด',
  approvals: 'อนุมัติ',
  attendance: 'เข้างาน',
  warnings: 'ใบเตือน',
  system: 'ระบบ',
}

export const TAB_ICONS: Record<NotificationTab, string> = {
  all: '🔔',
  approvals: '✅',
  attendance: '🕐',
  warnings: '⚠️',
  system: '⚙️',
}

const APPROVAL_TYPES: NotificationType[] = [
  'LEAVE_REQUEST', 'LEAVE_APPROVED', 'LEAVE_REJECTED',
  'OUTSIDE_REQUEST', 'OUTSIDE_APPROVED', 'OUTSIDE_REJECTED',
  'FORGOT_SCAN_REQUEST', 'FORGOT_SCAN_APPROVED', 'FORGOT_SCAN_REJECTED',
  'WEEKLY_PLAN_DUE', 'WEEKLY_PLAN_APPROVED', 'WEEKLY_PLAN_REJECTED',
  'REGISTER_REQUEST', 'ACCOUNT_APPROVED', 'ACCOUNT_REJECTED',
  'EXPENSE_CLAIM_SUBMITTED', 'EXPENSE_CLAIM_APPROVED', 'EXPENSE_CLAIM_REJECTED', 'EXPENSE_CLAIM_PAID',
  'DOC_UPLOADED', 'DOC_SIGNATURE_REQUIRED', 'DOC_APPROVED', 'DOC_REJECTED',
]

const ATTENDANCE_TYPES: NotificationType[] = [
  'DEVICE_RESET_REQUEST',
]

const WARNING_TYPES: NotificationType[] = ['WARNING_ISSUED']

const SYSTEM_TYPES: NotificationType[] = [
  'ANNOUNCEMENT', 'SYSTEM',
  'TASK_ASSIGNED', 'TASK_SUBMITTED', 'TASK_APPROVED', 'TASK_REVISION',
  'TASK_DEADLINE_REMINDER', 'TASK_OVERDUE', 'TASK_COURT_REMINDER', 'TASK_APPOINTMENT_REMINDER',
  'TASK_WAITING_DOC', 'TASK_DEPENDENCY_UNBLOCKED', 'TASK_AUTOMATION_TRIGGERED',
  'DEBT_APPOINTMENT_DUE', 'DEBT_APPOINTMENT_MISSED', 'DEBT_PAYMENT_RECEIVED',
  'CONTRACT_EXPIRING',
]

export const TAB_TYPE_MAP: Record<Exclude<NotificationTab, 'all'>, NotificationType[]> = {
  approvals: APPROVAL_TYPES,
  attendance: ATTENDANCE_TYPES,
  warnings: WARNING_TYPES,
  system: SYSTEM_TYPES,
}

/** Primary tab for a notification type (attendance keywords override SYSTEM). */
export function getTabForNotification(type: NotificationType, title: string, message: string): NotificationTab {
  if (WARNING_TYPES.includes(type)) return 'warnings'
  if (APPROVAL_TYPES.includes(type)) return 'approvals'
  if (ATTENDANCE_TYPES.includes(type)) return 'attendance'
  if (SYSTEM_TYPES.includes(type)) {
    const text = `${title} ${message}`.toLowerCase()
    if (/มาสาย|เช็คอิน|check.?in|gps|สแกน|เข้างาน|ลืมสแกน|attendance/.test(text)) {
      return 'attendance'
    }
    return 'system'
  }
  return 'system'
}

export function typesForTab(tab: NotificationTab): NotificationType[] | null {
  if (tab === 'all') return null
  if (tab === 'attendance') {
    return [...ATTENDANCE_TYPES, 'SYSTEM', 'FORGOT_SCAN_APPROVED', 'FORGOT_SCAN_REJECTED']
  }
  return TAB_TYPE_MAP[tab]
}

export function matchesTab(type: NotificationType, title: string, message: string, tab: NotificationTab): boolean {
  if (tab === 'all') return true
  return getTabForNotification(type, title, message) === tab
}

export const PRIORITY_BY_TYPE: Partial<Record<NotificationType, NotificationPriority>> = {
  TASK_OVERDUE: 'urgent',
  DEBT_APPOINTMENT_MISSED: 'urgent',
  WARNING_ISSUED: 'urgent',
  LEAVE_REQUEST: 'urgent',
  OUTSIDE_REQUEST: 'urgent',
  FORGOT_SCAN_REQUEST: 'urgent',
  REGISTER_REQUEST: 'urgent',
  EXPENSE_CLAIM_SUBMITTED: 'urgent',
  DOC_SIGNATURE_REQUIRED: 'urgent',
  TASK_DEADLINE_REMINDER: 'warning',
  TASK_WAITING_DOC: 'warning',
  WEEKLY_PLAN_DUE: 'warning',
  DEBT_APPOINTMENT_DUE: 'warning',
  CONTRACT_EXPIRING: 'warning',
  TASK_COURT_REMINDER: 'warning',
  TASK_APPOINTMENT_REMINDER: 'warning',
}

export function getPriority(type: NotificationType, title: string, message: string): NotificationPriority {
  const mapped = PRIORITY_BY_TYPE[type]
  if (mapped) return mapped
  const text = `${title} ${message}`
  if (/มาสาย|gps ไม่ตรง|overdue|เลยกำหนด|ด่วน|urgent/i.test(text)) return 'warning'
  if (/⚠️|🚨|🔴/.test(title)) return 'warning'
  return 'info'
}

export const PRIORITY_STYLES: Record<NotificationPriority, {
  border: string
  dot: string
  badge: string
  label: string
}> = {
  urgent: {
    border: 'border-l-red-500',
    dot: 'bg-red-500',
    badge: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/25',
    label: 'ด่วน',
  },
  warning: {
    border: 'border-l-amber-500',
    dot: 'bg-amber-500',
    badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25',
    label: 'ควรทราบ',
  },
  info: {
    border: 'border-l-green-500',
    dot: 'bg-green-500',
    badge: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/25',
    label: 'ทั่วไป',
  },
}

export const TYPE_ICONS: Partial<Record<NotificationType, string>> = {
  LEAVE_REQUEST: '📅', LEAVE_APPROVED: '✅', LEAVE_REJECTED: '❌',
  OUTSIDE_REQUEST: '🚗', OUTSIDE_APPROVED: '✅', OUTSIDE_REJECTED: '❌',
  REGISTER_REQUEST: '👤', ACCOUNT_APPROVED: '✅', ACCOUNT_REJECTED: '❌',
  FORGOT_SCAN_REQUEST: '🔍', FORGOT_SCAN_APPROVED: '✅', FORGOT_SCAN_REJECTED: '❌',
  WARNING_ISSUED: '⚠️', WEEKLY_PLAN_DUE: '⏰', WEEKLY_PLAN_APPROVED: '✅',
  WEEKLY_PLAN_REJECTED: '❌',
  ANNOUNCEMENT: '📢', DEVICE_RESET_REQUEST: '📱', SYSTEM: '🔔',
  TASK_ASSIGNED: '📋', TASK_SUBMITTED: '📤', TASK_APPROVED: '✅', TASK_REVISION: '🔄',
  TASK_DEADLINE_REMINDER: '⏰', TASK_OVERDUE: '🔴',
  TASK_COURT_REMINDER: '⚖️', TASK_APPOINTMENT_REMINDER: '📅',
  TASK_WAITING_DOC: '📄',
}

export const DEFAULT_LINKS: Partial<Record<NotificationType, string>> = {
  LEAVE_REQUEST: '/approval-center', LEAVE_APPROVED: '/leave', LEAVE_REJECTED: '/leave',
  OUTSIDE_REQUEST: '/approval-center', OUTSIDE_APPROVED: '/outside-work', OUTSIDE_REJECTED: '/outside-work',
  REGISTER_REQUEST: '/employees', ACCOUNT_APPROVED: '/profile', ACCOUNT_REJECTED: '/profile',
  WARNING_ISSUED: '/warnings', WEEKLY_PLAN_DUE: '/weekly-plan', WEEKLY_PLAN_APPROVED: '/weekly-plan',
  WEEKLY_PLAN_REJECTED: '/weekly-plan',
  FORGOT_SCAN_REQUEST: '/approval-center', FORGOT_SCAN_APPROVED: '/attendance', FORGOT_SCAN_REJECTED: '/forgot-scan',
  ANNOUNCEMENT: '/announcements', DEVICE_RESET_REQUEST: '/profile', SYSTEM: '/notifications',
  TASK_ASSIGNED: '/tasks', TASK_SUBMITTED: '/tasks', TASK_APPROVED: '/tasks', TASK_REVISION: '/tasks',
  TASK_DEADLINE_REMINDER: '/tasks', TASK_OVERDUE: '/tasks',
  TASK_COURT_REMINDER: '/tasks', TASK_APPOINTMENT_REMINDER: '/tasks',
  TASK_WAITING_DOC: '/tasks',
}

export function resolveLink(type: NotificationType, link: string | null): string {
  const defaultLink = DEFAULT_LINKS[type] ?? '/notifications'
  if (!link) return defaultLink
  if (type.startsWith('WEEKLY_PLAN_') && link === '/leave') return defaultLink
  if (type.startsWith('FORGOT_SCAN_') && (link === '/approvals' || link === '/leave')) return defaultLink
  return link
}
