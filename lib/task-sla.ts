// Overdue severity levels for visual display
export type OverdueSeverity = 'none' | 'warning' | 'danger' | 'critical'

export interface OverdueInfo {
  isOverdue: boolean
  daysLate: number
  hoursLate: number
  severity: OverdueSeverity
  label: string
  colorClass: string
}

const ACTIVE_STATUSES = new Set([
  'PENDING', 'NEW', 'ASSIGNED', 'IN_PROGRESS',
  'WAITING_DOC', 'REVISION', 'WAITING_APPROVAL', 'WAITING_REVIEW',
])

export function getOverdueInfo(dueDate: Date | string | null, status: string): OverdueInfo {
  const none: OverdueInfo = {
    isOverdue: false, daysLate: 0, hoursLate: 0,
    severity: 'none', label: '', colorClass: '',
  }

  if (!dueDate || !ACTIVE_STATUSES.has(status)) return none

  const due = typeof dueDate === 'string' ? new Date(dueDate) : dueDate
  const now = new Date()
  if (due >= now) return none

  const msLate = now.getTime() - due.getTime()
  const hoursLate = Math.floor(msLate / (1000 * 60 * 60))
  const daysLate = Math.floor(hoursLate / 24)

  let severity: OverdueSeverity
  let label: string
  let colorClass: string

  if (daysLate >= 7) {
    severity = 'critical'
    label = `เกินกำหนด ${daysLate} วัน`
    colorClass = 'text-red-500 animate-pulse'
  } else if (daysLate >= 4) {
    severity = 'danger'
    label = `เกินกำหนด ${daysLate} วัน`
    colorClass = 'text-red-500'
  } else if (daysLate >= 1) {
    severity = 'warning'
    label = `เกินกำหนด ${daysLate} วัน`
    colorClass = 'text-orange-500'
  } else {
    severity = 'warning'
    label = `เกินกำหนด ${hoursLate} ชั่วโมง`
    colorClass = 'text-orange-500'
  }

  return { isOverdue: true, daysLate, hoursLate, severity, label, colorClass }
}

export function getSeverityBadgeClass(severity: OverdueSeverity): string {
  switch (severity) {
    case 'critical': return 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse'
    case 'danger':   return 'bg-red-500/15 text-red-400 border border-red-500/20'
    case 'warning':  return 'bg-orange-500/15 text-orange-400 border border-orange-500/20'
    default:         return ''
  }
}

// SLA deadline calculation
export function calcSlaDeadline(createdAt: Date | string, slaHours: number): Date {
  const base = typeof createdAt === 'string' ? new Date(createdAt) : createdAt
  return new Date(base.getTime() + slaHours * 60 * 60 * 1000)
}

// Days remaining until due date (negative = overdue)
export function daysUntilDue(dueDate: Date | string): number {
  const due = typeof dueDate === 'string' ? new Date(dueDate) : dueDate
  const now = new Date()
  const ms = due.getTime() - now.getTime()
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

// Escalation level based on days overdue
export type EscalationLevel = 'none' | 'team_leader' | 'manager' | 'ceo'

export function getEscalationLevel(daysLate: number): EscalationLevel {
  if (daysLate >= 7) return 'ceo'
  if (daysLate >= 3) return 'manager'
  if (daysLate >= 1) return 'team_leader'
  return 'none'
}
