import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Topbar from '@/components/dashboard/Topbar'
import { ROLE_LABELS } from '@/lib/permissions'
import { formatThaiDate } from '@/lib/utils'
import Link from 'next/link'
import AttendanceChartWrapper from '@/components/dashboard/AttendanceChartWrapper'
import EmployeeDashboard from './EmployeeDashboard'
import BranchFilterBar from '@/components/dashboard/BranchFilterBar'
import {
  buildBranchScope,
  branchUserWhere,
  attendanceWhere,
  requestUserWhere,
  parseBranchQueryParam,
} from '@/lib/branch-scope'
import { startOfTodayBangkok, bangkokDateKey } from '@/lib/datetime-bangkok'
import { Suspense } from 'react'

type Role = 'SUPER_ADMIN' | 'CEO' | 'MANAGER_HR' | 'HR' | 'MANAGER' | 'TEAM_LEADER' | 'ADMIN' | 'EMPLOYEE' | 'LAWYER' | 'ENFORCEMENT'

function SummaryCard({
  label, value, sub, gradient, glow, iconPath, href,
}: {
  label: string; value: number | string; sub: string
  gradient: string; glow: string; iconPath: string; href: string
}) {
  return (
    <Link href={href} className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98]">
      <div className="pointer-events-none absolute -right-3 -top-3 h-16 w-16 rounded-full opacity-15 blur-2xl" style={{ background: gradient }} />
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

  const scope = buildBranchScope(session.user, { branchId: branchParam })
  const activeUserWhere = branchUserWhere(scope, { status: 'ACTIVE' })
  const pendingUserWhere = branchUserWhere(scope, { status: 'PENDING' })

  const todayStart = startOfTodayBangkok()
  const todayAttWhere = attendanceWhere(scope, { date: { gte: todayStart } })

  const [
    totalUsers, pendingLeaves, todayAttendance, todayLate, pendingUsers,
  ] = await Promise.all([
    prisma.user.count({ where: activeUserWhere }),
    prisma.leaveRequest.count({ where: requestUserWhere(scope, { status: 'PENDING' }) }),
    prisma.attendance.count({ where: todayAttWhere }),
    prisma.attendance.count({ where: attendanceWhere(scope, { date: { gte: todayStart }, status: 'LATE' }) }),
    prisma.user.count({ where: pendingUserWhere }),
  ])

  const chartData = await Promise.all(
    Array.from({ length: 7 }).map(async (_, i) => {
      const d = new Date(`${bangkokDateKey(new Date(Date.now() - (6 - i) * 86400_000))}T00:00:00+07:00`)
      const next = new Date(`${bangkokDateKey(new Date(d.getTime() + 86400_000))}T00:00:00+07:00`)
      const [present, late, absent] = await Promise.all([
        prisma.attendance.count({ where: attendanceWhere(scope, { date: { gte: d, lt: next }, status: { in: ['NORMAL', 'OT'] } }) }),
        prisma.attendance.count({ where: attendanceWhere(scope, { date: { gte: d, lt: next }, status: 'LATE' }) }),
        prisma.attendance.count({ where: attendanceWhere(scope, { date: { gte: d, lt: next }, status: 'ABSENT' }) }),
      ])
      return {
        day: d.toLocaleDateString('th-TH', { weekday: 'short', timeZone: 'Asia/Bangkok' }),
        present, late, absent,
      }
    })
  )

  return (
    <div className="flex flex-col">
      <Topbar
        title={`สวัสดี, ${name.split(' ')[0]} 👋`}
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

      <div className="p-5 md:p-6 space-y-6">

        {/* ─── 4 Summary Cards (drill-down) ─── */}
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
            label="คำขอลา"
            value={pendingLeaves}
            sub="รอดำเนินการ"
            gradient="linear-gradient(135deg,#06b6d4,#0284c7)"
            glow="rgba(6,182,212,0.3)"
            iconPath="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </div>

        {/* ─── Attendance Chart (full width) ─── */}
        <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white text-[16px]">ภาพรวมการเข้างาน</h2>
              <p className="text-[13px] text-slate-500 mt-0.5">7 วันย้อนหลัง</p>
            </div>
            <Link href="/attendance" className="text-[13px] text-blue-600 dark:text-blue-400 hover:text-blue-500 flex items-center gap-1">
              ดูทั้งหมด
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </Link>
          </div>
          <div className="mb-3 flex items-center gap-4 text-[13px] text-slate-500">
            {[['#3b82f6', 'เข้างาน'], ['#f59e0b', 'มาสาย'], ['#ef4444', 'ขาด/ลา']].map(([c, l]) => (
              <span key={l} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />{l}
              </span>
            ))}
          </div>
          <AttendanceChartWrapper data={chartData} />
        </div>

        {/* ─── Quick Actions ─── */}
        <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-5 md:p-6">
          <h2 className="mb-4 font-semibold text-slate-900 dark:text-white text-[16px]">Quick Actions</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
            {[
              { href: '/employees',     label: 'พนักงาน',   icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',  gradient: 'from-blue-500 to-indigo-500',   roles: ['SUPER_ADMIN', 'MANAGER_HR', 'HR', 'MANAGER', 'ADMIN'] as Role[] },
              { href: '/payroll',       label: 'เงินเดือน', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', gradient: 'from-emerald-500 to-teal-500',   roles: ['SUPER_ADMIN', 'MANAGER_HR', 'HR'] as Role[] },
              { href: '/approvals',     label: 'อนุมัติ',    icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',                                                                                                                                                                                                                   gradient: 'from-violet-500 to-purple-500', roles: ['SUPER_ADMIN', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER'] as Role[] },
              { href: '/attendance',    label: 'เวลางาน',   icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',                                                                                                                                                                                                                      gradient: 'from-cyan-500 to-blue-500' },
              { href: '/announcements', label: 'ประกาศ',     icon: 'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z',                                                      gradient: 'from-orange-500 to-amber-500' },
              { href: '/warnings',      label: 'ใบเตือน',    icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',                                                                                                                           gradient: 'from-red-500 to-rose-500' },
            ].filter(a => !a.roles || (a.roles as string[]).includes(role)).map((a) => (
              <Link key={a.href} href={a.href}
                className="group flex flex-col items-center gap-2 rounded-xl p-3.5 text-center border border-slate-200 dark:border-white/[0.05] bg-slate-50 dark:bg-white/[0.02] transition-all duration-150 hover:-translate-y-0.5 hover:border-slate-300 dark:hover:border-white/[0.1] hover:bg-slate-100 dark:hover:bg-white/[0.04]">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${a.gradient} group-hover:scale-105 transition-transform`}>
                  <svg width={18} height={18} className="h-4.5 w-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d={a.icon} />
                  </svg>
                </div>
                <span className="text-[12px] font-medium text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors leading-tight">{a.label}</span>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
