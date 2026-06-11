import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import PerformanceClient from './PerformanceClient'
import { calcKpiScore } from '@/lib/kpi'

const CAN_SEE_ALL  = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR']
const CAN_SEE_TEAM = ['MANAGER', 'TEAM_LEADER', 'ADMIN']
const DEPT_LABELS: Record<string, string> = {
  DEBT: 'ฝ่ายเร่งรัดหนี้', LAW: 'ฝ่ายกฎหมาย', ASSET: 'ฝ่ายสืบทรัพย์', ENFORCE: 'ฝ่ายบังคับคดี',
}
const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize(v: unknown): any { return JSON.parse(JSON.stringify(v)) }

export default async function PerformancePage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/')

  const role   = session.user.role
  const userId = session.user.id
  const now    = new Date()
  const in7    = new Date(now.getTime() + 7  * 86400_000)
  const in30   = new Date(now.getTime() + 30 * 86400_000)

  let whereAssignee: { in: string[] } | undefined

  if (CAN_SEE_ALL.includes(role)) {
    whereAssignee = undefined
  } else if (CAN_SEE_TEAM.includes(role)) {
    const members = await prisma.user.findMany({
      where: { OR: [{ managerId: userId }, { teamLeaderId: userId }] },
      select: { id: true },
    })
    whereAssignee = { in: [userId, ...members.map((u) => u.id)] }
  } else {
    whereAssignee = { in: [userId] }
  }

  const tasks = await prisma.taskAssignment.findMany({
    where: whereAssignee ? { assigneeId: whereAssignee } : undefined,
    include: { assignee: { select: { id: true, name: true, department: true, role: true } } },
    orderBy: { createdAt: 'desc' },
    take: 2000,
  })

  // Summary
  const ACTIVE = new Set(['IN_PROGRESS', 'ASSIGNED', 'WAITING_DOC', 'WAITING_REVIEW', 'REVISION', 'NEW'])
  const totalCases        = tasks.length
  const activeCases       = tasks.filter((t) => ACTIVE.has(t.status)).length
  const overdueTasks      = tasks.filter((t) => t.dueDate && t.dueDate < now && t.status !== 'COMPLETED').length
  const upcomingDeadlines = tasks.filter((t) => t.dueDate && t.dueDate >= now && t.dueDate <= in7 && t.status !== 'COMPLETED').length
  const upcomingCourt     = tasks.filter((t) => t.courtDate && t.courtDate >= now && t.courtDate <= in30).length

  // By department
  const byDepartment = ['DEBT', 'LAW', 'ASSET', 'ENFORCE'].map((dept) => {
    const dt     = tasks.filter((t) => t.taskDepartment === dept)
    const comp   = dt.filter((t) => t.status === 'COMPLETED')
    const ov     = dt.filter((t) => t.dueDate && t.dueDate < now && t.status !== 'COMPLETED')
    const onTime = comp.filter((t) => !t.dueDate || !t.reviewedAt || t.reviewedAt <= t.dueDate)
    return {
      dept, label: DEPT_LABELS[dept] ?? dept,
      total: dt.length, completed: comp.length, overdue: ov.length, onTime: onTime.length,
      completionRate: dt.length > 0 ? Math.round(comp.length / dt.length * 100) : 0,
      onTimeRate: comp.length > 0 ? Math.round(onTime.length / comp.length * 100) : 0,
      kpiScore: calcKpiScore(dt.length, comp.length, ov.length, onTime.length),
    }
  }).filter((d) => d.total > 0)

  // Employee ranking
  type EmpStats = { userId: string; name: string; department: string | null; role: string; total: number; completed: number; overdue: number; onTime: number; kpiScore: number }
  const empMap = new Map<string, EmpStats>()
  for (const t of tasks) {
    const emp = t.assignee
    if (!empMap.has(emp.id)) {
      empMap.set(emp.id, { userId: emp.id, name: emp.name, department: emp.department, role: emp.role, total: 0, completed: 0, overdue: 0, onTime: 0, kpiScore: 0 })
    }
    const e = empMap.get(emp.id)!
    e.total++
    if (t.status === 'COMPLETED') {
      e.completed++
      if (!t.dueDate || !t.reviewedAt || t.reviewedAt <= t.dueDate) e.onTime++
    }
    if (t.dueDate && t.dueDate < now && t.status !== 'COMPLETED') e.overdue++
  }
  const employeeRanking = Array.from(empMap.values())
    .map((e) => ({ ...e, kpiScore: calcKpiScore(e.total, e.completed, e.overdue, e.onTime) }))
    .sort((a, b) => b.kpiScore - a.kpiScore)

  // Monthly trend
  type MonthEntry = { month: string; label: string; total: number; completed: number; overdue: number }
  const monthMap = new Map<string, MonthEntry>()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now); d.setDate(1); d.setMonth(d.getMonth() - i)
    const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = `${THAI_MONTHS[d.getMonth()]} ${String(d.getFullYear() + 543).slice(2)}`
    monthMap.set(key, { month: key, label, total: 0, completed: 0, overdue: 0 })
  }
  for (const t of tasks) {
    const d   = new Date(t.createdAt)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (monthMap.has(key)) {
      const m = monthMap.get(key)!
      m.total++
      if (t.status === 'COMPLETED') m.completed++
      if (t.dueDate && t.dueDate < now && t.status !== 'COMPLETED') m.overdue++
    }
  }
  const monthlyTrend = Array.from(monthMap.values())

  // Court upcoming (next 30 days)
  const courtUpcoming = tasks
    .filter((t) => t.courtDate && t.courtDate >= now && t.courtDate <= in30)
    .sort((a, b) => new Date(a.courtDate!).getTime() - new Date(b.courtDate!).getTime())
    .slice(0, 15)
    .map((t) => ({
      id: t.id, title: t.title, caseNumber: t.caseNumber, clientName: t.clientName,
      courtDate: t.courtDate!.toISOString(), assigneeName: t.assignee.name, status: t.status,
    }))

  const apptUpcoming = tasks
    .filter((t) => t.appointmentDate && t.appointmentDate >= now && t.appointmentDate <= in30)
    .sort((a, b) => new Date(a.appointmentDate!).getTime() - new Date(b.appointmentDate!).getTime())
    .slice(0, 10)
    .map((t) => ({
      id: t.id, title: t.title, caseNumber: t.caseNumber, clientName: t.clientName,
      appointmentDate: t.appointmentDate!.toISOString(), appointmentPlace: t.appointmentPlace,
      assigneeName: t.assignee.name, status: t.status,
    }))

  const canSeeAll  = CAN_SEE_ALL.includes(role)
  const canSeeTeam = CAN_SEE_TEAM.includes(role)

  return (
    <div className="flex flex-col">
      <Topbar title="KPI / ผลงาน" subtitle="ติดตามประสิทธิภาพและผลงานของทีม" />
      <PerformanceClient
        summary={serialize({ totalCases, activeCases, overdueTasks, upcomingDeadlines, upcomingCourt })}
        byDepartment={serialize(byDepartment)}
        employeeRanking={serialize(employeeRanking)}
        monthlyTrend={serialize(monthlyTrend)}
        courtUpcoming={serialize(courtUpcoming)}
        apptUpcoming={serialize(apptUpcoming)}
        role={role}
        userId={userId}
        canSeeAll={canSeeAll}
        canSeeTeam={canSeeTeam}
      />
    </div>
  )
}
