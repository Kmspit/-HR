import type { ApprovalType } from './types'

export const TYPE_LABELS: Record<ApprovalType, string> = {
  LEAVE: 'ลางาน',
  OUTSIDE: 'ออกนอกสถานที่',
  WEEKLY_PLAN: 'แผนงานสัปดาห์',
  FORGOT_SCAN: 'แก้เวลาลงงาน',
}

export const TYPE_ICONS: Record<ApprovalType, string> = {
  LEAVE: '📅',
  OUTSIDE: '🚗',
  WEEKLY_PLAN: '📋',
  FORGOT_SCAN: '⏱️',
}

export const TYPE_COLORS: Record<ApprovalType, string> = {
  LEAVE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  OUTSIDE: 'bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-300',
  WEEKLY_PLAN: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  FORGOT_SCAN: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300',
}

export const STATUS_LABELS: Record<string, string> = {
  PENDING: 'รออนุมัติ',
  APPROVED: 'อนุมัติแล้ว',
  REJECTED: 'ปฏิเสธ',
  ADMIN_APPROVED: 'รอ HR',
  ADMIN_REJECTED: 'ปฏิเสธ',
}

export const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  APPROVED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
  ADMIN_APPROVED: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300',
  ADMIN_REJECTED: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
}

export const TAB_LABELS = {
  pending: 'รออนุมัติ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ปฏิเสธ',
  mine: 'คำขอของฉัน',
} as const
