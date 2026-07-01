import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import type { CaseStatus, CasePriority } from '@prisma/client'
import Topbar from '@/components/dashboard/Topbar'
import { ROLE_LABELS, canViewTeamOnly } from '@/lib/access-control'
import { canAccessModule, WORK_MODULE, LEGAL_MODULE, HR_ADMIN, EMPLOYEE_MGMT } from '@/lib/module-gates'
import { canAccessPage } from '@/lib/page-access'
import { getDirectReportUserIds } from '@/lib/org-scope'
import { formatThaiDate } from '@/lib/utils'
import Link from 'next/link'
import EmployeeDashboard from './EmployeeDashboard'
import ApproverDashboard from './ApproverDashboard'
import BranchFilterBar from '@/components/dashboard/BranchFilterBar'
import {
  buildBranchScope,
  branchUserWhere,
  parseBranchQueryParam,
} from '@/lib/branch-scope'
import { Suspense } from 'react'
import SmartDashboard from '@/components/smart-dashboard/SmartDashboard'
import { loadSmartDashboardData } from '@/lib/smart-dashboard/load-data'
import ApprovalInboxBanner from '@/components/dashboard/ApprovalInboxBanner'
import { APPR_ROLES } from '@/lib/module-gates'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/')
  const { role, name, id: userId } = session.user
  const sp = await searchParams
  const branchParam = parseBranchQueryParam(sp.branchId)

  if (role === 'EMPLOYEE' || role === 'LAWYER') {
    return <EmployeeDashboard userId={userId} name={name ?? ''} role={role} />
  }

  if (role === 'TEAM_LEADER') {
    return <ApproverDashboard userId={userId} name={name ?? ''} role={role} />
  }

  const scope = buildBranchScope(session.user, { branchId: branchParam })
  const activeUserWhere = branchUserWhere(scope, { status: 'ACTIVE' })
  const pendingUserWhere = branchUserWhere(scope, { status: 'PENDING' })

  const now = new Date()
  const showTaskKpi = canAccessModule(role, WORK_MODULE) || canViewTeamOnly(role)
  const showCaseKpi = canAccessModule(role, LEGAL_MODULE)
  const canLinkTasks = canAccessPage(role, '/tasks')
  const canLinkCases = canAccessPage(role, '/cases')

  let taskManagedIds: string[] | null = null
  if (role === 'MANAGER') {
    taskManagedIds = await getDirectReportUserIds(prisma, userId, role)
  }

  const taskWhere = taskManagedIds !== null ? { assigneeId: { in: taskManagedIds } } : {}

  type CaseWhereClause = Record<string, unknown>
  let caseWhere: CaseWhereClause = {}
  if (!canAccessModule(role, HR_ADMIN)) {
    if (role === 'MANAGER') {
      const reportIds = taskManagedIds ?? []
      const teamIds = [userId, ...reportIds]
      caseWhere = {
        OR: [
          { assignedEmployeeId: { in: teamIds } },
          { createdById: { in: teamIds } },
        ],
      }
    } else if (['LAWYER', 'ENFORCEMENT'].includes(role)) {
      caseWhere = { OR: [{ assignedEmployeeId: userId }, { createdById: userId }] }
    }
  }
  const activeStatuses: CaseStatus[] = [
    'NEW', 'ASSIGNED', 'INVESTIGATING', 'NEGOTIATING', 'WAITING_DOCUMENT',
    'FILED', 'COURT_PROCESS', 'ENFORCEMENT', 'SETTLED',
  ]
  const caseActiveWhere = { ...caseWhere, status: { in: activeStatuses } }
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [
    totalUsers,
    pendingUsers,
    overdueTaskCount,
    taskTotal,
    taskCompleted,
    taskInProgress,
    taskWaitingReview,
    taskHighPriority,
    caseActive,
    caseOverdue,
    caseHighRisk,
    caseCourtThisWeek,
  ] = await Promise.all([
    prisma.user.count({ where: activeUserWhere }),
    prisma.user.count({ where: pendingUserWhere }),
    prisma.taskAssignment.count({
      where: {
        ...taskWhere,
        dueDate: { lt: now },
        status: { notIn: ['COMPLETED', 'CANCELLED', 'REJECTED'] },
      },
    }),
    showTaskKpi ? prisma.taskAssignment.count({ where: taskWhere }) : Promise.resolve(0),
    showTaskKpi ? prisma.taskAssignment.count({ where: { ...taskWhere, status: 'COMPLETED' } }) : Promise.resolve(0),
    showTaskKpi ? prisma.taskAssignment.count({ where: { ...taskWhere, status: 'IN_PROGRESS' } }) : Promise.resolve(0),
    showTaskKpi
      ? prisma.taskAssignment.count({ where: { ...taskWhere, status: { in: ['WAITING_REVIEW', 'WAITING_APPROVAL'] } } })
      : Promise.resolve(0),
    showTaskKpi
      ? prisma.taskAssignment.count({
          where: {
            ...taskWhere,
            priority: { in: ['HIGH', 'URGENT'] },
            status: { notIn: ['COMPLETED', 'CANCELLED', 'REJECTED'] },
          },
        })
      : Promise.resolve(0),
    showCaseKpi ? prisma.case.count({ where: caseActiveWhere }) : Promise.resolve(0),
    showCaseKpi
      ? prisma.case.count({ where: { ...caseWhere, dueDate: { lt: now }, status: { in: activeStatuses } } })
      : Promise.resolve(0),
    showCaseKpi
      ? prisma.case.count({ where: { ...caseActiveWhere, priority: { in: ['HIGH', 'CRITICAL'] as CasePriority[] } } })
      : Promise.resolve(0),
    showCaseKpi
      ? prisma.caseCourt.count({ where: { courtDate: { gte: now, lte: weekEnd }, case: caseActiveWhere } })
      : Promise.resolve(0),
  ])

  const smartStarted = Date.now()
  const smartData = await loadSmartDashboardData(prisma, scope, totalUsers, {
    pendingUsers,
    overdueTasks: overdueTaskCount,
  })
  const smartMs = Date.now() - smartStarted
  console.log(`[dashboard] loadSmartDashboardData ${smartMs}ms branch=${branchParam ?? 'default'}`)

  const taskCompletionRate = taskTotal > 0 ? Math.round((taskCompleted / taskTotal) * 100) : 0
  const taskOverdueRate = taskTotal > 0 ? Math.round((overdueTaskCount / taskTotal) * 100) : 0

  return (
    <div className="flex flex-col">
      <Topbar
        title={`สวัสดี, ${(name ?? 'ผู้ใช้').split(' ')[0]} 👋`}
        subtitle={`${ROLE_LABELS[role]} · ${formatThaiDate(new Date())} · Smart Dashboard`}
        actions={
          pendingUsers > 0 && canAccessModule(role, EMPLOYEE_MGMT) ? (
            <Link
              href="/employees?tab=pending"
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
              </span>
              รออนุมัติ {pendingUsers} คน
            </Link>
          ) : undefined
        }
      />
      <Suspense fallback={null}>
        <BranchFilterBar role={role} filterBranchId={branchParam} />
      </Suspense>

      <div className="p-5 md:p-6 space-y-6">
        {APPR_ROLES.includes(role) && (
          <ApprovalInboxBanner userId={userId} role={role} />
        )}
        <SmartDashboard data={JSON.parse(JSON.stringify(smartData))} role={role} />

        {showTaskKpi && taskTotal > 0 && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 md:dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.05]">
              <h2 className="font-semibold text-slate-900 dark:text-white text-[15px]">ภาพรวมงาน</h2>
              {canLinkTasks ? (
                <Link href="/tasks" className="text-[12px] text-blue-600 dark:text-blue-400 font-medium hover:underline">
                  ดูทั้งหมด →
                </Link>
              ) : (
                <span className="text-[12px] text-slate-400">ภาพรวมงาน</span>
              )}
            </div>
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {(
                [
                  { label: 'ทั้งหมด', val: taskTotal, color: 'text-slate-700 dark:text-slate-200', bg: 'bg-slate-50 dark:bg-white/[0.03]' },
                  { label: 'กำลังดำเนินการ', val: taskInProgress, color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-500/[0.07]' },
                  { label: 'รอตรวจ/อนุมัติ', val: taskWaitingReview, color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/[0.07]' },
                  { label: 'เกินกำหนด', val: overdueTaskCount, color: 'text-red-700 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-500/[0.07]' },
                  { label: 'เสร็จสิ้น', val: taskCompleted, color: 'text-green-700 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-500/[0.07]' },
                ] as { label: string; val: number; color: string; bg: string }[]
              ).map(({ label, val, color, bg }) => (
                <div key={label} className={`rounded-xl p-3 ${bg}`}>
                  <p className={`text-xl font-bold ${color}`}>{val}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">{label}</p>
                </div>
              ))}
            </div>
            <div className="px-4 pb-4 flex flex-wrap gap-4 items-center">
              <div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-1">อัตราเสร็จงาน</p>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-28 rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
                    <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${taskCompletionRate}%` }} />
                  </div>
                  <span className="text-[12px] font-bold text-green-600 dark:text-green-400">{taskCompletionRate}%</span>
                </div>
              </div>
              {overdueTaskCount > 0 && (
                <div>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-1">อัตราเกินกำหนด</p>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-28 rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
                      <div className="h-full rounded-full bg-red-500 transition-all" style={{ width: `${taskOverdueRate}%` }} />
                    </div>
                    <span className="text-[12px] font-bold text-red-600 dark:text-red-400">{taskOverdueRate}%</span>
                  </div>
                </div>
              )}
              {taskHighPriority > 0 && (
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-400 px-2.5 py-1 text-[12px] font-semibold">
                  🟠 {taskHighPriority} งานเร่งด่วน/สูง
                </span>
              )}
            </div>
          </div>
        )}

        {showCaseKpi && caseActive > 0 && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 md:dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.05]">
              <h2 className="font-semibold text-slate-900 dark:text-white text-[15px]">ภาพรวมคดี</h2>
              {canLinkCases ? (
                <Link href="/cases" className="text-[12px] text-blue-600 dark:text-blue-400 font-medium hover:underline">
                  ดูทั้งหมด →
                </Link>
              ) : (
                <span className="text-[12px] text-slate-400">ภาพรวมคดี</span>
              )}
            </div>
            <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(
                [
                  { label: 'คดีที่ดำเนินการ', val: caseActive, color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-500/[0.07]' },
                  { label: 'นัดศาลสัปดาห์นี้', val: caseCourtThisWeek, color: 'text-purple-700 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-500/[0.07]' },
                  { label: 'ความเสี่ยงสูง/วิกฤต', val: caseHighRisk, color: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-500/[0.07]' },
                  { label: 'เกินกำหนด', val: caseOverdue, color: 'text-red-700 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-500/[0.07]' },
                ] as { label: string; val: number; color: string; bg: string }[]
              ).map(({ label, val, color, bg }) => (
                <div key={label} className={`rounded-xl p-3 ${bg}`}>
                  <p className={`text-xl font-bold ${color}`}>{val}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">{label}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
