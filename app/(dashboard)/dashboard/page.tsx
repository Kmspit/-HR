import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import type { CaseStatus, CasePriority } from '@prisma/client'
import Topbar from '@/components/dashboard/Topbar'
import { ROLE_LABELS } from '@/lib/permissions'
import { formatThaiDate } from '@/lib/utils'
import Link from 'next/link'
import EmployeeDashboard from './EmployeeDashboard'
import ApproverDashboard from './ApproverDashboard'
import BranchFilterBar from '@/components/dashboard/BranchFilterBar'
import {
  buildBranchScope,
  branchUserWhere,
  attendanceWhere,
  requestUserWhere,
  parseBranchQueryParam,
} from '@/lib/branch-scope'
import { startOfTodayBangkok } from '@/lib/datetime-bangkok'
import { Suspense } from 'react'
import { canAccessApprovals, canApproveOutsideWork, canManageEmployees } from '@/lib/permissions'
import { getApproverInboxCounts, formatInboxSummary } from '@/lib/approval-inbox'
import { canApproveWeeklyPlan } from '@/lib/permissions'
import type { Role } from '@prisma/client'

function SummaryCard({
  label, value, sub, gradient, glow, iconPath, href,
}: {
  label: string; value: number | string; sub: string
  gradient: string; glow: string; iconPath: string; href: string
}) {
  return (
    <Link href={href} className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 md:dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-4 transition-all duration-200 md:hover:-translate-y-0.5 md:hover:shadow-md md:active:scale-[0.98]">
      <div className="pointer-events-none absolute -right-3 -top-3 hidden h-16 w-16 rounded-full opacity-15 blur-2xl md:block" style={{ background: gradient }} />
      <div className="relative flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: gradient, boxShadow: `0 4px 12px ${glow}` }}>
          <svg width={18} height={18} className="h-4.5 w-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-slate-500 dark:text-slate-400 leading-none">{label}</p>
          <p className="mt-1.5 text-2xl font-extrabold text-slate-900 dark:text-white leading-none">{value}</p>
          <p className="mt-1 text-[12px] text-slate-400 dark:text-slate-500 truncate">{sub}</p>
        </div>
        <svg className="h-4 w-4 flex-shrink-0 text-slate-300 dark:text-slate-600 group-hover:text-slate-400 dark:group-hover:text-slate-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  )
}

type ActionItem = {
  label: string
  count: number
  href: string
  emptyText: string
  warnColor: string
  dotColor: string
}

function ActionRow({ item }: { item: ActionItem }) {
  const hasItems = item.count > 0
  return (
    <Link
      href={item.href}
      className="group flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-white/[0.025] transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${hasItems ? item.dotColor : 'bg-emerald-400'}`} />
        <span className={`text-[14px] leading-snug truncate ${hasItems ? 'text-slate-800 dark:text-slate-200 font-medium' : 'text-slate-500 dark:text-slate-500'}`}>
          {item.label}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
        {hasItems ? (
          <span className={`text-[14px] font-bold ${item.warnColor}`}>{item.count} รายการ</span>
        ) : (
          <span className="text-[13px] text-emerald-500">{item.emptyText}</span>
        )}
        <svg className="h-4 w-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  )
}

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

  const userRole = role as Role
  const usesInboxCounts = canAccessApprovals(userRole)

  const scope = buildBranchScope(session.user, { branchId: branchParam })
  const activeUserWhere = branchUserWhere(scope, { status: 'ACTIVE' })
  const pendingUserWhere = branchUserWhere(scope, { status: 'PENDING' })
  const todayStart = startOfTodayBangkok()
  const todayAttWhere = attendanceWhere(scope, { date: { gte: todayStart } })

  const now = new Date()
  const CAN_SEE_TASK_KPI = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'MANAGER', 'TEAM_LEADER', 'ADMIN']
  const showTaskKpi = CAN_SEE_TASK_KPI.includes(role)
  const CAN_SEE_CASE_KPI = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'LAWYER', 'ENFORCEMENT']
  const showCaseKpi = CAN_SEE_CASE_KPI.includes(role)

  // Build task scope for managers/team leaders
  let taskManagedIds: string[] | null = null
  if (role === 'MANAGER') {
    const managed = await prisma.user.findMany({ where: { managerId: userId }, select: { id: true } })
    taskManagedIds = managed.map(u => u.id)
  }

  const taskWhere = taskManagedIds !== null
    ? { assigneeId: { in: taskManagedIds } }
    : {}

  // Case scope
  const CASE_EXEC = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']
  type CaseWhereClause = Record<string, unknown>
  let caseWhere: CaseWhereClause = {}
  if (!CASE_EXEC.includes(role)) {
    if (role === 'MANAGER' && session.user.department) {
      caseWhere = { department: session.user.department }
    } else if (['LAWYER', 'ENFORCEMENT'].includes(role)) {
      caseWhere = { OR: [{ assignedEmployeeId: userId }, { createdById: userId }] }
    }
  }
  const activeStatuses: CaseStatus[] = ['NEW', 'ASSIGNED', 'INVESTIGATING', 'NEGOTIATING', 'WAITING_DOCUMENT', 'FILED', 'COURT_PROCESS', 'ENFORCEMENT', 'SETTLED']
  const caseActiveWhere = { ...caseWhere, status: { in: activeStatuses } }
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [
    totalUsers, pendingLeaves, todayAttendance, todayLate,
    pendingUsers, overdueTaskCount,
    taskTotal, taskCompleted, taskInProgress, taskWaitingReview, taskHighPriority,
    caseActive, caseOverdue, caseHighRisk, caseCourtThisWeek,
    inboxCounts,
  ] = await Promise.all([
    prisma.user.count({ where: activeUserWhere }),
    prisma.leaveRequest.count({ where: requestUserWhere(scope, { status: 'PENDING' }) }),
    prisma.attendance.count({ where: todayAttWhere }),
    prisma.attendance.count({ where: attendanceWhere(scope, { date: { gte: todayStart }, status: 'LATE' }) }),
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
    showTaskKpi ? prisma.taskAssignment.count({ where: { ...taskWhere, status: { in: ['WAITING_REVIEW', 'WAITING_APPROVAL'] } } }) : Promise.resolve(0),
    showTaskKpi ? prisma.taskAssignment.count({ where: { ...taskWhere, priority: { in: ['HIGH', 'URGENT'] }, status: { notIn: ['COMPLETED', 'CANCELLED', 'REJECTED'] } } }) : Promise.resolve(0),
    showCaseKpi ? prisma.case.count({ where: caseActiveWhere }) : Promise.resolve(0),
    showCaseKpi ? prisma.case.count({ where: { ...caseWhere, dueDate: { lt: now }, status: { in: activeStatuses } } }) : Promise.resolve(0),
    showCaseKpi ? prisma.case.count({ where: { ...caseActiveWhere, priority: { in: ['HIGH', 'CRITICAL'] as CasePriority[] } } }) : Promise.resolve(0),
    showCaseKpi ? prisma.caseCourt.count({ where: { courtDate: { gte: now, lte: weekEnd }, case: caseActiveWhere } }) : Promise.resolve(0),
    usesInboxCounts ? getApproverInboxCounts(prisma, userId, userRole) : Promise.resolve(null),
  ])

  const pendingLeaveCount = usesInboxCounts && inboxCounts ? inboxCounts.leave : pendingLeaves
  const pendingOutsideCount = usesInboxCounts && inboxCounts ? inboxCounts.outside : 0
  const pendingWeeklyCount = usesInboxCounts && inboxCounts ? inboxCounts.weekly : 0
  const pendingForgotScanCount = usesInboxCounts && inboxCounts ? inboxCounts.forgotScan : 0
  const pendingApprovalTotal = usesInboxCounts && inboxCounts ? inboxCounts.total : pendingLeaves
  const inboxSummarySub = usesInboxCounts && inboxCounts
    ? formatInboxSummary(inboxCounts, userRole)
    : 'รอดำเนินการ'

  const taskCompletionRate = taskTotal > 0 ? Math.round(taskCompleted / taskTotal * 100) : 0
  const taskOverdueRate    = taskTotal > 0 ? Math.round(overdueTaskCount / taskTotal * 100) : 0

  const actionItems: ActionItem[] = [
    {
      label: 'มาสายวันนี้',
      count: todayLate,
      href: '/attendance',
      emptyText: 'ไม่มีคนสาย',
      warnColor: 'text-amber-500',
      dotColor: 'bg-amber-400',
    },
    {
      label: usesInboxCounts ? 'ลารออนุมัติ (ของคุณ)' : 'คำขอลารออนุมัติ',
      count: pendingLeaveCount,
      href: '/approvals',
      emptyText: 'ไม่มีรายการค้าง',
      warnColor: 'text-blue-600',
      dotColor: 'bg-blue-400',
    },
    ...(usesInboxCounts && canApproveOutsideWork(userRole)
      ? [{
          label: 'ออกนอกสถานที่รออนุมัติ',
          count: pendingOutsideCount,
          href: '/approvals',
          emptyText: 'ไม่มีรายการค้าง',
          warnColor: 'text-orange-600',
          dotColor: 'bg-orange-400',
        }]
      : []),
    ...(usesInboxCounts && (canApproveWeeklyPlan(userRole) || userRole === 'CEO' || userRole === 'ADMIN') && pendingWeeklyCount > 0
      ? [{
          label: 'แผนงานทนายรออนุมัติ',
          count: pendingWeeklyCount,
          href: '/approvals',
          emptyText: 'ไม่มีรายการค้าง',
          warnColor: 'text-amber-600',
          dotColor: 'bg-amber-400',
        }]
      : []),
    ...(usesInboxCounts && pendingForgotScanCount > 0
      ? [{
          label: 'แก้ไขเวลาลงงานรออนุมัติ',
          count: pendingForgotScanCount,
          href: '/approvals',
          emptyText: 'ไม่มีรายการค้าง',
          warnColor: 'text-indigo-600',
          dotColor: 'bg-indigo-400',
        }]
      : []),
    {
      label: 'งานเกินกำหนด',
      count: overdueTaskCount,
      href: '/tasks',
      emptyText: 'ทุกงานอยู่ในกำหนด',
      warnColor: 'text-red-500',
      dotColor: 'bg-red-400',
    },
    ...(canManageEmployees(userRole)
      ? [{
          label: 'พนักงานรออนุมัติสมัคร',
          count: pendingUsers,
          href: '/employees?tab=pending',
          emptyText: 'ไม่มีรายการรอ',
          warnColor: 'text-violet-600',
          dotColor: 'bg-violet-400',
        }]
      : []),
  ]

  const totalUrgent = actionItems.reduce((s, i) => s + i.count, 0)

  return (
    <div className="flex flex-col">
      <Topbar
        title={`สวัสดี, ${(name ?? 'ผู้ใช้').split(' ')[0]} 👋`}
        subtitle={`${ROLE_LABELS[role]} · ${formatThaiDate(new Date())}`}
        actions={
          pendingUsers > 0 ? (
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

      <div className="p-5 md:p-6 space-y-5">

        {/* ─── 4 Summary Cards ─── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard
            href="/employees"
            label="พนักงาน"
            value={totalUsers}
            sub={pendingUsers > 0 ? `${pendingUsers} รออนุมัติ` : 'คนทั้งหมด'}
            gradient="linear-gradient(135deg,#3b82f6,#6366f1)"
            glow="rgba(99,102,241,0.3)"
            iconPath="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
          />
          <SummaryCard
            href="/attendance"
            label="เข้างานวันนี้"
            value={todayAttendance}
            sub={`${totalUsers > 0 ? Math.round(todayAttendance / totalUsers * 100) : 0}% ของพนักงาน`}
            gradient="linear-gradient(135deg,#22c55e,#16a34a)"
            glow="rgba(34,197,94,0.3)"
            iconPath="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
          <SummaryCard
            href="/attendance"
            label="มาสายวันนี้"
            value={todayLate}
            sub="คน · ดูรายชื่อ"
            gradient="linear-gradient(135deg,#f59e0b,#d97706)"
            glow="rgba(245,158,11,0.3)"
            iconPath="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
          <SummaryCard
            href="/approvals"
            label={usesInboxCounts ? 'ศูนย์อนุมัติ' : 'คำขอลา'}
            value={pendingApprovalTotal}
            sub={usesInboxCounts ? inboxSummarySub : 'รอดำเนินการ'}
            gradient="linear-gradient(135deg,#06b6d4,#0284c7)"
            glow="rgba(6,182,212,0.3)"
            iconPath="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </div>

        {/* ─── Needs Attention ─── */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 md:dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.05]">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-slate-900 dark:text-white text-[15px]">ต้องดำเนินการ</h2>
              {totalUrgent > 0 && (
                <span className="inline-flex items-center justify-center h-5 min-w-5 rounded-full bg-red-500 text-white text-[11px] font-bold px-1.5">
                  {totalUrgent}
                </span>
              )}
            </div>
            {totalUrgent === 0 && (
              <span className="text-[13px] text-emerald-500 font-medium">ทุกอย่างเรียบร้อย</span>
            )}
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/[0.04]">
            {actionItems.map((item) => (
              <ActionRow key={item.href} item={item} />
            ))}
          </div>
        </div>

        {/* ─── Task KPI (manager/CEO/HR) ─── */}
        {showTaskKpi && taskTotal > 0 && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 md:dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.05]">
              <h2 className="font-semibold text-slate-900 dark:text-white text-[15px]">ภาพรวมงาน</h2>
              <Link href="/tasks" className="text-[12px] text-blue-600 dark:text-blue-400 font-medium hover:underline">
                ดูทั้งหมด →
              </Link>
            </div>
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {([
                { label: 'ทั้งหมด',        val: taskTotal,         color: 'text-slate-700 dark:text-slate-200',  bg: 'bg-slate-50 dark:bg-white/[0.03]' },
                { label: 'กำลังดำเนินการ', val: taskInProgress,    color: 'text-blue-700  dark:text-blue-400',   bg: 'bg-blue-50  dark:bg-blue-500/[0.07]' },
                { label: 'รอตรวจ/อนุมัติ', val: taskWaitingReview, color: 'text-amber-700 dark:text-amber-400',  bg: 'bg-amber-50 dark:bg-amber-500/[0.07]' },
                { label: 'เกินกำหนด',      val: overdueTaskCount,  color: 'text-red-700   dark:text-red-400',    bg: 'bg-red-50   dark:bg-red-500/[0.07]' },
                { label: 'เสร็จสิ้น',       val: taskCompleted,     color: 'text-green-700 dark:text-green-400',  bg: 'bg-green-50 dark:bg-green-500/[0.07]' },
              ] as { label: string; val: number; color: string; bg: string }[]).map(({ label, val, color, bg }) => (
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

        {/* ─── Case KPI (legal/debt roles) ─── */}
        {showCaseKpi && caseActive > 0 && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 md:dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.05]">
              <h2 className="font-semibold text-slate-900 dark:text-white text-[15px]">ภาพรวมคดี</h2>
              <Link href="/cases" className="text-[12px] text-blue-600 dark:text-blue-400 font-medium hover:underline">ดูทั้งหมด →</Link>
            </div>
            <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {([
                { label: 'คดีที่ดำเนินการ',    val: caseActive,         color: 'text-blue-700   dark:text-blue-400',  bg: 'bg-blue-50   dark:bg-blue-500/[0.07]' },
                { label: 'นัดศาลสัปดาห์นี้',   val: caseCourtThisWeek, color: 'text-purple-700 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-500/[0.07]' },
                { label: 'ความเสี่ยงสูง/วิกฤต', val: caseHighRisk,      color: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-500/[0.07]' },
                { label: 'เกินกำหนด',           val: caseOverdue,       color: 'text-red-700    dark:text-red-400',    bg: 'bg-red-50    dark:bg-red-500/[0.07]' },
              ] as { label: string; val: number; color: string; bg: string }[]).map(({ label, val, color, bg }) => (
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
