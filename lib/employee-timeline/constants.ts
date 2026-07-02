import type { TimelineCategory, TimelineFilter, TimelineStatusTone } from './types'

export const FILTER_LABELS: Record<TimelineFilter, string> = {
  all: 'ทั้งหมด',
  attendance: 'เข้างาน',
  leave: 'ลางาน',
  warnings: 'ใบเตือน',
  payroll: 'เงินเดือน',
}

export const FILTER_ICONS: Record<TimelineFilter, string> = {
  all: '📋',
  attendance: '🕐',
  leave: '📅',
  warnings: '⚠️',
  payroll: '💰',
}

export const CATEGORY_LABELS: Record<TimelineCategory, string> = {
  attendance: 'เข้างาน',
  leave: 'ลางาน',
  outside: 'ออกนอกสถานที่',
  warning: 'ใบเตือน',
  payroll: 'เงินเดือน',
  approval: 'การอนุมัติ',
}

export const CATEGORY_COLORS: Record<TimelineCategory, string> = {
  attendance: 'bg-emerald-500',
  leave: 'bg-green-500',
  outside: 'bg-violet-500',
  warning: 'bg-amber-500',
  payroll: 'bg-teal-500',
  approval: 'bg-orange-500',
}

export const CATEGORY_BADGE: Record<TimelineCategory, string> = {
  attendance: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  leave: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
  outside: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  payroll: 'bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300',
  approval: 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300',
}

export const REQUEST_STATUS_LABELS: Record<string, string> = {
  PENDING: 'รออนุมัติ',
  APPROVED: 'อนุมัติแล้ว',
  REJECTED: 'ปฏิเสธ',
  ADMIN_APPROVED: 'รอ HR',
  ADMIN_REJECTED: 'ปฏิเสธ',
}

export const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  NORMAL: 'ปกติ',
  LATE: 'มาสาย',
  ABSENT: 'ขาดงาน',
  LEAVE: 'ลา',
  OT: 'ล่วงเวลา',
  HALF_DAY: 'ครึ่งวัน',
  EARLY_LEAVE: 'ออกก่อน',
}

export const SCAN_TYPE_LABELS: Record<string, string> = {
  checkin: 'เข้างาน',
  'lunch-out': 'พักกลางวันออก',
  'lunch-in': 'กลับจากพัก',
  checkout: 'เลิกงาน',
}

export const APPROVAL_STEP_STATUS: Record<string, string> = {
  APPROVED: 'อนุมัติ',
  REJECTED: 'ปฏิเสธ',
  SKIPPED: 'ข้าม',
  PENDING: 'รอดำเนินการ',
}

export function statusToneFromRequest(status: string): TimelineStatusTone {
  if (status === 'APPROVED') return 'success'
  if (status === 'REJECTED' || status === 'ADMIN_REJECTED') return 'danger'
  if (status === 'PENDING' || status === 'ADMIN_APPROVED') return 'warning'
  return 'neutral'
}

export function statusToneFromWarning(status: string): TimelineStatusTone {
  if (status === 'APPROVED') return 'success'
  if (status === 'REJECTED') return 'danger'
  if (status === 'PENDING_APPROVAL' || status === 'DRAFT') return 'warning'
  return 'neutral'
}

export function statusToneFromAttendance(status: string): TimelineStatusTone {
  if (status === 'LATE' || status === 'EARLY_LEAVE') return 'warning'
  if (status === 'ABSENT') return 'danger'
  if (status === 'NORMAL' || status === 'OT') return 'success'
  return 'info'
}

const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

export function formatTimelineMonth(date: Date | string): string {
  const d = new Date(date)
  return `${MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`
}

export function formatTimelineTime(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function formatTimelineDate(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
}
