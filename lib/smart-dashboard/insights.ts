import type { AIInsight, TodayOverview, TrendPoint } from './types'

type InsightInput = {
  overview: TodayOverview
  lateTrend: TrendPoint[]
  leaveTrend: TrendPoint[]
  attendanceTrend: TrendPoint[]
  deptLeaveRates: { department: string; rate: number; days: number; employees: number }[]
  lateWeekChangePct: number | null
  attendanceWeekChangePct: number | null
}

export function buildAIInsights(input: InsightInput): AIInsight[] {
  const insights: AIInsight[] = []

  if (input.lateWeekChangePct !== null && Math.abs(input.lateWeekChangePct) >= 5) {
    const up = input.lateWeekChangePct > 0
    insights.push({
      id: 'late-week',
      message: up
        ? `การมาสายเพิ่มขึ้น ${Math.abs(input.lateWeekChangePct)}% สัปดาห์นี้`
        : `การมาสายลดลง ${Math.abs(input.lateWeekChangePct)}% สัปดาห์นี้`,
      trend: up ? 'up' : 'down',
      metric: `${input.overview.lateToday} คนวันนี้`,
    })
  }

  if (input.attendanceWeekChangePct !== null && Math.abs(input.attendanceWeekChangePct) >= 3) {
    const up = input.attendanceWeekChangePct > 0
    insights.push({
      id: 'attendance-week',
      message: up
        ? `อัตราเข้างานเฉลี่ยเพิ่มขึ้น ${Math.abs(input.attendanceWeekChangePct)}% สัปดาห์นี้`
        : `อัตราเข้างานเฉลี่ยลดลง ${Math.abs(input.attendanceWeekChangePct)}% สัปดาห์นี้`,
      trend: up ? 'up' : 'down',
    })
  }

  const topDept = input.deptLeaveRates
    .filter((d) => d.employees >= 2 && d.rate > 0)
    .sort((a, b) => b.rate - a.rate)[0]

  if (topDept) {
    insights.push({
      id: 'dept-leave',
      message: `แผนก${topDept.department} มีอัตราการลาสูงสุด (${topDept.rate} วัน/คน/30 วัน)`,
      trend: 'neutral',
      metric: `${topDept.days} วันลารวม`,
    })
  }

  const leaveSum = input.leaveTrend.reduce((s, p) => s + (p.leave ?? p.value), 0)
  if (leaveSum >= 5) {
    insights.push({
      id: 'leave-active',
      message: `มีพนักงานลาเฉลี่ย ${Math.round(leaveSum / Math.max(input.leaveTrend.length, 1))} คน/วัน ในช่วง 7 วัน`,
      trend: 'neutral',
    })
  }

  if (input.overview.pendingApprovals >= 10) {
    insights.push({
      id: 'approval-backlog',
      message: `คิวอนุมัติค้าง ${input.overview.pendingApprovals} รายการ — ควรดำเนินการภายในวันนี้`,
      trend: 'up',
    })
  }

  if (input.overview.absentToday > 0 && input.overview.totalEmployees > 0) {
    const pct = Math.round((input.overview.absentToday / input.overview.totalEmployees) * 100)
    if (pct >= 10) {
      insights.push({
        id: 'absent-high',
        message: `ขาดงานวันนี้ ${pct}% ของพนักงาน (${input.overview.absentToday} คน)`,
        trend: 'up',
      })
    }
  }

  if (insights.length === 0) {
    insights.push({
      id: 'all-good',
      message: 'ภาพรวม HR วันนี้อยู่ในเกณฑ์ปกติ — ไม่พบสัญญาณผิดปกติ',
      trend: 'neutral',
    })
  }

  return insights.slice(0, 5)
}

export function buildAlerts(overview: TodayOverview, breakdown: {
  pendingLeave: number
  pendingOutside: number
  pendingWeekly: number
  pendingForgot: number
  pendingExpense: number
  pendingDocs: number
  pendingUsers: number
  overdueTasks: number
}): import('./types').SmartAlert[] {
  const alerts: import('./types').SmartAlert[] = []

  if (overview.lateToday > 0) {
    alerts.push({
      id: 'late',
      message: `มีพนักงานมาสาย ${overview.lateToday} คนวันนี้`,
      severity: overview.lateToday >= 5 ? 'critical' : 'warning',
      href: '/attendance',
      count: overview.lateToday,
    })
  }

  if (overview.pendingApprovals > 0) {
    alerts.push({
      id: 'approvals',
      message: `มีคำขอรออนุมัติ ${overview.pendingApprovals} รายการ`,
      severity: overview.pendingApprovals >= 10 ? 'critical' : 'warning',
      href: '/approval-center',
      count: overview.pendingApprovals,
    })
  }

  if (breakdown.pendingForgot > 0) {
    alerts.push({
      id: 'forgot-scan',
      message: `มีคำขอแก้เวลา ${breakdown.pendingForgot} รายการ`,
      severity: 'warning',
      href: '/approval-center',
      count: breakdown.pendingForgot,
    })
  }

  if (overview.absentToday > 0) {
    alerts.push({
      id: 'absent',
      message: `ขาดงานวันนี้ ${overview.absentToday} คน`,
      severity: overview.absentToday >= 5 ? 'warning' : 'info',
      href: '/attendance',
      count: overview.absentToday,
    })
  }

  if (breakdown.pendingUsers > 0) {
    alerts.push({
      id: 'pending-users',
      message: `มีผู้สมัครรออนุมัติ ${breakdown.pendingUsers} คน`,
      severity: 'info',
      href: '/employees?tab=pending',
      count: breakdown.pendingUsers,
    })
  }

  if (breakdown.overdueTasks > 0) {
    alerts.push({
      id: 'overdue-tasks',
      message: `มีงานเกินกำหนด ${breakdown.overdueTasks} รายการ`,
      severity: 'warning',
      href: '/tasks',
      count: breakdown.overdueTasks,
    })
  }

  if (alerts.length === 0) {
    alerts.push({
      id: 'clear',
      message: 'ไม่มีการแจ้งเตือนที่ต้องดำเนินการ — ทุกอย่างเรียบร้อย',
      severity: 'info',
      count: 0,
    })
  }

  return alerts
}
