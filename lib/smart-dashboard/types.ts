export type TodayOverview = {
  totalEmployees: number
  presentToday: number
  lateToday: number
  absentToday: number
  pendingApprovals: number
  onLeaveToday: number
}

export type SmartAlert = {
  id: string
  message: string
  severity: 'info' | 'warning' | 'critical'
  href?: string
  count: number
}

export type TrendPoint = {
  day: string
  label: string
  value: number
  present?: number
  late?: number
  absent?: number
  leave?: number
}

export type AIInsight = {
  id: string
  message: string
  trend?: 'up' | 'down' | 'neutral'
  metric?: string
}

export type SmartDashboardPayload = {
  overview: TodayOverview
  alerts: SmartAlert[]
  attendanceTrend: TrendPoint[]
  leaveTrend: TrendPoint[]
  lateTrend: TrendPoint[]
  insights: AIInsight[]
}
