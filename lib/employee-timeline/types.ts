export type TimelineCategory =
  | 'attendance'
  | 'leave'
  | 'outside'
  | 'warning'
  | 'payroll'
  | 'approval'

export type TimelineFilter = 'all' | 'attendance' | 'leave' | 'warnings' | 'payroll'

export type TimelineStatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info'

export type TimelineEvent = {
  id: string
  date: string
  category: TimelineCategory
  title: string
  details: string
  status?: string
  statusTone?: TimelineStatusTone
  link?: string
}

export type EmployeeTimelineSummary = {
  id: string
  name: string
  employeeId: string | null
  department: string | null
  position: string | null
  role: string
  startDate: string | null
}

export type EmployeeTimelinePayload = {
  employee: EmployeeTimelineSummary
  events: TimelineEvent[]
  counts: Record<TimelineFilter, number>
}

export function matchesTimelineFilter(category: TimelineCategory, filter: TimelineFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'attendance') return category === 'attendance' || category === 'outside'
  if (filter === 'leave') return category === 'leave'
  if (filter === 'warnings') return category === 'warning'
  if (filter === 'payroll') return category === 'payroll'
  return true
}

export function computeFilterCounts(events: TimelineEvent[]): Record<TimelineFilter, number> {
  const counts: Record<TimelineFilter, number> = {
    all: events.length,
    attendance: 0,
    leave: 0,
    warnings: 0,
    payroll: 0,
  }
  for (const e of events) {
    if (e.category === 'attendance' || e.category === 'outside') counts.attendance += 1
    if (e.category === 'leave') counts.leave += 1
    if (e.category === 'warning') counts.warnings += 1
    if (e.category === 'payroll') counts.payroll += 1
  }
  return counts
}
