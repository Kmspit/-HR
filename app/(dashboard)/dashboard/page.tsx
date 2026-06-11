import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Topbar from '@/components/dashboard/Topbar'
import { ROLE_LABELS } from '@/lib/permissions'
import { formatThaiDate, formatLateMinutes } from '@/lib/utils'
import Link from 'next/link'
import AttendanceChartWrapper from '@/components/dashboard/AttendanceChartWrapper'
import EmployeeDashboard from './EmployeeDashboard'
import BranchFilterBar from '@/components/dashboard/BranchFilterBar'
import {
  buildBranchScope,
  branchUserWhere,
  branchNestedUserWhere,
  attendanceWhere,
  requestUserWhere,
  parseBranchQueryParam,
} from '@/lib/branch-scope'
import { startOfTodayBangkok, bangkokDateKey } from '@/lib/datetime-bangkok'
import { Suspense } from 'react'

type Role = 'SUPER_ADMIN' | 'CEO' | 'MANAGER_HR' | 'HR' | 'MANAGER' | 'TEAM_LEADER' | 'ADMIN' | 'EMPLOYEE' | 'LAWYER' | 'ENFORCEMENT'

/* ─── helpers ─── */
function StatCard({
  label, value, sub, gradient, glow, iconPath,
}: {
  label: string; value: number | string; sub: string
  gradient: string; glow: string; iconPath: string
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="pointer-events-none absolute -right-3 -top-3 h-16 w-16 rounded-full opacity-15 blur-2xl" style={{ background: gradient }} />
      <div className="relative flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: gradient, boxShadow: `0 4px 12px ${glow}` }}>
          <svg width={18} height={18} className="hr-icon h-4.5 w-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium text-slate-500 dark:text-slate-400 leading-none">{label}</p>
          <p className="mt-1.5 text-2xl font-extrabold text-slate-900 dark:text-white leading-none">{value}</p>
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 truncate">{sub}</p>
        </div>
      </div>
    </div>
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
  const nestedUser = branchNestedUserWhere(scope)

  const todayStart = startOfTodayBangkok()
  const todayAttWhere = attendanceWhere(scope, { date: { gte: todayStart } })

  /* ─── parallel data fetch ─── */
  const [
    totalUsers, pendingLeaves, pendingOutside, todayAttendance,
    todayLate, todayAbsent, pendingUsers, pendingApprovals,
    recentLeaves, payrollRecs,
  ] = await Promise.all([
    prisma.user.count({ where: activeUserWhere }),
    prisma.leaveRequest.count({ where: requestUserWhere(scope, { status: 'PENDING' }) }),
    prisma.outsideWorkRequest.count({
      where: {
        status: 'PENDING',
        ...(nestedUser ? { user: nestedUser } : {}),
      },
    }),
    prisma.attendance.count({ where: todayAttWhere }),
    prisma.attendance.count({ where: attendanceWhere(scope, { date: { gte: todayStart }, status: 'LATE' }) }),
    prisma.attendance.count({ where: attendanceWhere(scope, { date: { gte: todayStart }, status: 'ABSENT' }) }),
    prisma.user.count({ where: pendingUserWhere }),
    role === 'MANAGER_HR'
      ? prisma.leaveRequest.count({ where: requestUserWhere(scope, { status: 'ADMIN_APPROVED' }) })
      : prisma.leaveRequest.count({ where: requestUserWhere(scope, { status: 'PENDING' }) }),
    prisma.leaveRequest.findMany({
      where: requestUserWhere(scope),
      include: { user: { select: { name: true, department: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.payroll.findMany({
      where: {
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        ...(nestedUser ? { user: nestedUser } : {}),
      },
      include: { user: { select: { name: true, department: true, baseSalary: true } } },
      take: 50,
    }),
  ])

  /* ─── late employees ─── */
  const lateToday = await prisma.attendance.findMany({
    where: attendanceWhere(scope, { date: { gte: todayStart }, status: 'LATE' }),
    include: { user: { select: { id: true, name: true, department: true } } },
    take: 5,
  })

  /* ─── 7-day chart data ─── */
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

  /* ─── payroll by dept ─── */
  const deptMap: Record<string, number> = {}
  for (const p of payrollRecs) {
    const dept = p.user.department ?? 'อื่นๆ'
    deptMap[dept] = (deptMap[dept] ?? 0) + p.netSalary
  }
  const deptPayroll = Object.entries(deptMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
  const totalPayroll = Object.values(deptMap).reduce((a, b) => a + b, 0)

  /* ─── activity feed ─── */
  const recentAttendance = await prisma.attendance.findMany({
    where: todayAttWhere,
    include: { user: { select: { name: true } } },
    orderBy: { checkIn: 'desc' },
    take: 5,
  })

  const leaveTypeLabel: Record<string, string> = {
    SICK: 'ลาป่วย', VACATION: 'ลาพักร้อน', PERSONAL: 'ลากิจ',
    UNPAID: 'ลาไม่รับค่าจ้าง', MATERNITY: 'ลาคลอด', ORDINATION: 'บวช',
  }

  const statusMap: Record<string, { label: string; cls: string }> = {
    PENDING:        { label: 'รออนุมัติ',  cls: 'badge-yellow' },
    ADMIN_APPROVED: { label: 'ผ่าน Admin', cls: 'badge-blue' },
    APPROVED:       { label: 'อนุมัติ',    cls: 'badge-green' },
    REJECTED:       { label: 'ปฏิเสธ',     cls: 'badge-red' },
  }

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

        {/* ─── Stat Cards ─── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="พนักงาน" value={totalUsers} sub={`${pendingUsers} รออนุมัติ`}
            gradient="linear-gradient(135deg,#3b82f6,#6366f1)" glow="rgba(99,102,241,0.3)"
            iconPath="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
          />
          <StatCard label="เข้างานวันนี้" value={todayAttendance} sub={`${totalUsers > 0 ? Math.round(todayAttendance/totalUsers*100) : 0}%`}
            gradient="linear-gradient(135deg,#22c55e,#16a34a)" glow="rgba(34,197,94,0.3)"
            iconPath="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
          <StatCard label="มาสายวันนี้" value={todayLate} sub="คน"
            gradient="linear-gradient(135deg,#f59e0b,#d97706)" glow="rgba(245,158,11,0.3)"
            iconPath="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
          <StatCard label="ขาด/ลาวันนี้" value={todayAbsent + pendingLeaves} sub="คน"
            gradient="linear-gradient(135deg,#ef4444,#dc2626)" glow="rgba(239,68,68,0.3)"
            iconPath="M6 18L18 6M6 6l12 12"
          />
          <StatCard label="ออกนอกสถานที่" value={pendingOutside} sub="รออนุมัติ"
            gradient="linear-gradient(135deg,#a855f7,#7c3aed)" glow="rgba(168,85,247,0.3)"
            iconPath="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
          />
          <StatCard label="คำขอลา" value={pendingLeaves} sub="รอดำเนินการ"
            gradient="linear-gradient(135deg,#06b6d4,#0284c7)" glow="rgba(6,182,212,0.3)"
            iconPath="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
          <StatCard label="Final Approve" value={pendingApprovals} sub="รอผู้จัดการ"
            gradient="linear-gradient(135deg,#f97316,#ea580c)" glow="rgba(249,115,22,0.3)"
            iconPath="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
          <StatCard label="เงินเดือนรวม" value={totalPayroll > 0 ? `${(totalPayroll/1000000).toFixed(1)}M` : '—'} sub="เดือนนี้"
            gradient="linear-gradient(135deg,#10b981,#059669)" glow="rgba(16,185,129,0.3)"
            iconPath="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </div>

        {/* ─── Chart + Activity Feed ─── */}
        <div className="grid gap-5 lg:grid-cols-3">
          {/* Attendance Chart */}
          <div className="lg:col-span-2 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-5 md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-900 dark:text-white text-[16px]">ภาพรวมการเข้างาน</h2>
                <p className="text-[13px] text-slate-500 mt-0.5">7 วันย้อนหลัง</p>
              </div>
              <Link href="/attendance" className="text-[13px] text-blue-600 dark:text-blue-400 hover:text-blue-500 flex items-center gap-1">
                ดูทั้งหมด
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
              </Link>
            </div>
            {/* Legend */}
            <div className="mb-3 flex items-center gap-4 text-[13px] text-slate-500">
              {[['#3b82f6','เข้างาน'],['#f59e0b','มาสาย'],['#ef4444','ขาด/ลา']].map(([c,l]) => (
                <span key={l} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />{l}
                </span>
              ))}
            </div>
            <AttendanceChartWrapper data={chartData} />
          </div>

          {/* Activity Feed */}
          <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-5 md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900 dark:text-white text-[16px]">กิจกรรมล่าสุด</h2>
              <span className="badge-blue text-[11px]">วันนี้</span>
            </div>
            <div className="space-y-3">
              {recentAttendance.length === 0 && (
                <p className="text-center text-[14px] text-slate-500 py-6">ยังไม่มีกิจกรรมวันนี้</p>
              )}
              {recentAttendance.map((a) => (
                <div key={a.id} className="flex items-start gap-2.5">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[12px] font-bold text-white mt-0.5"
                    style={{ background: a.status === 'LATE' ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'linear-gradient(135deg,#22c55e,#16a34a)' }}>
                    {a.user.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-200 leading-tight truncate">{a.user.name}</p>
                    <p className="text-[12px] text-slate-500 mt-0.5">
                      {a.status === 'LATE' ? `มาสาย ${formatLateMinutes(a.lateMinutes)}` : 'เช็คอินแล้ว'}
                      {a.checkIn && ` · ${new Date(a.checkIn).toLocaleTimeString('th-TH', {
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'Asia/Bangkok',
                      })}`}
                    </p>
                  </div>
                  <span className={a.status === 'LATE' ? 'badge-yellow' : 'badge-green'} style={{ fontSize: '11px' }}>
                    {a.status === 'LATE' ? 'สาย' : 'ปกติ'}
                  </span>
                </div>
              ))}
              {recentLeaves.slice(0, 3 - Math.min(recentAttendance.length, 3)).map((l) => (
                <div key={l.id} className="flex items-start gap-2.5">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-500/20 text-[12px] font-bold text-blue-700 dark:text-blue-400 mt-0.5">
                    {l.user.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-200 leading-tight truncate">{l.user.name}</p>
                    <p className="text-[12px] text-slate-500 mt-0.5">ขอ{leaveTypeLabel[l.type]}</p>
                  </div>
                  <span className="badge-yellow" style={{ fontSize: '11px' }}>รอ</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── Leave Requests + Late Employees ─── */}
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Leave requests */}
          <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-5 md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-900 dark:text-white text-[16px]">คำขอลา</h2>
                <p className="text-[13px] text-slate-500 mt-0.5">รายการล่าสุด</p>
              </div>
              <Link href="/approvals" className="text-[13px] text-blue-600 dark:text-blue-400 hover:text-blue-500 flex items-center gap-1">
                อนุมัติ
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
              </Link>
            </div>
            <div className="space-y-2">
              {recentLeaves.length === 0 ? (
                <p className="text-center text-[14px] text-slate-500 py-6">ไม่มีคำขอลา</p>
              ) : recentLeaves.map((l) => {
                const s = statusMap[l.status] ?? { label: l.status, cls: 'badge-slate' }
                return (
                  <div key={l.id} className="flex items-center gap-3 rounded-xl px-3 py-3 border border-slate-100 dark:border-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-[12px] font-bold text-white"
                      style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}>
                      {l.user.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-[14px] font-semibold text-slate-800 dark:text-slate-200">{l.user.name}</p>
                      <p className="text-[12px] text-slate-500">{leaveTypeLabel[l.type]} · {l.user.department ?? '—'}</p>
                    </div>
                    <span className={s.cls}>{s.label}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Late employees */}
          <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-5 md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-900 dark:text-white text-[16px]">มาสายวันนี้</h2>
                <p className="text-[13px] text-slate-500 mt-0.5">{lateToday.length} คน</p>
              </div>
              <Link href="/attendance" className="text-[13px] text-blue-600 dark:text-blue-400 hover:text-blue-500 flex items-center gap-1">
                ดูทั้งหมด
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
              </Link>
            </div>
            <div className="space-y-2">
              {lateToday.length === 0 ? (
                <div className="flex flex-col items-center py-6 gap-2">
                  <svg className="h-9 w-9 text-green-500/50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  <p className="text-[14px] text-slate-500">ไม่มีพนักงานมาสาย 🎉</p>
                </div>
              ) : lateToday.map((a) => (
                <div key={a.id} className="flex items-center gap-3 rounded-xl px-3 py-3 border border-amber-200 dark:border-yellow-500/10 bg-amber-50 dark:bg-yellow-500/[0.04]">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-[12px] font-bold text-white"
                    style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>
                    {a.user.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-[14px] font-semibold text-slate-800 dark:text-slate-200">{a.user.name}</p>
                    <p className="text-[12px] text-slate-500">{a.user.department ?? '—'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] font-bold text-amber-600 dark:text-yellow-400">+{formatLateMinutes(a.lateMinutes)}</p>
                    {a.checkIn && <p className="text-[11px] text-slate-500">{new Date(a.checkIn).toLocaleTimeString('th-TH', {
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'Asia/Bangkok',
                      })}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── Payroll by dept + Quick Actions ─── */}
        <div className="grid gap-5 lg:grid-cols-3">
          {/* Payroll by dept */}
          <div className="lg:col-span-2 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-5 md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-900 dark:text-white text-[16px]">เงินเดือนรายแผนก</h2>
                <p className="text-[13px] text-slate-500 mt-0.5">เดือนปัจจุบัน</p>
              </div>
              <Link href="/payroll" className="text-[13px] text-blue-600 dark:text-blue-400 hover:text-blue-500 flex items-center gap-1">
                จัดการ
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
              </Link>
            </div>
            {deptPayroll.length === 0 ? (
              <p className="text-center text-[14px] text-slate-500 py-6">ยังไม่มีข้อมูล Payroll เดือนนี้</p>
            ) : (
              <div className="space-y-3.5">
                {deptPayroll.map(([dept, amount]) => {
                  const pct = totalPayroll > 0 ? (amount / totalPayroll) * 100 : 0
                  return (
                    <div key={dept}>
                      <div className="mb-2 flex items-center justify-between text-[13px]">
                        <span className="text-slate-700 dark:text-slate-300 font-medium">{dept}</span>
                        <span className="text-slate-500 dark:text-slate-400">{amount.toLocaleString('th-TH')} ฿</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#3b82f6,#6366f1)' }}
                        />
                      </div>
                    </div>
                  )
                })}
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 dark:border-white/[0.06] pt-4">
                  <span className="text-[14px] font-semibold text-slate-700 dark:text-slate-300">รวมทั้งหมด</span>
                  <span className="text-[15px] font-bold text-slate-900 dark:text-white">{totalPayroll.toLocaleString('th-TH')} ฿</span>
                </div>
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-5 md:p-6">
            <h2 className="mb-4 font-semibold text-slate-900 dark:text-white text-[16px]">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { href: '/employees',     label: 'พนักงาน',    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',  gradient: 'from-blue-500 to-indigo-500',   roles: ['SUPER_ADMIN','MANAGER_HR','HR','MANAGER','ADMIN'] as Role[] },
                { href: '/payroll',       label: 'เงินเดือน',  icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', gradient: 'from-emerald-500 to-teal-500',   roles: ['SUPER_ADMIN','MANAGER_HR','HR'] as Role[] },
                { href: '/approvals',     label: 'อนุมัติ',     icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',                                                                                                                                                                                                                  gradient: 'from-violet-500 to-purple-500', roles: ['SUPER_ADMIN','MANAGER_HR','HR','ADMIN','MANAGER','TEAM_LEADER'] as Role[] },
                { href: '/attendance',    label: 'เวลางาน',    icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',                                                                                                                                                                                                                     gradient: 'from-cyan-500 to-blue-500' },
                { href: '/announcements', label: 'ประกาศ',      icon: 'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z',                                                     gradient: 'from-orange-500 to-amber-500' },
                { href: '/warnings',      label: 'ใบเตือน',     icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',                                                                                                                          gradient: 'from-red-500 to-rose-500' },
              ].filter(a => !a.roles || (a.roles as string[]).includes(role)).map((a) => (
                <Link key={a.href} href={a.href}
                  className="group flex flex-col items-center gap-2 rounded-xl p-3.5 text-center border border-slate-200 dark:border-white/[0.05] bg-slate-50 dark:bg-white/[0.02] transition-all duration-150 hover:-translate-y-0.5 hover:border-slate-300 dark:hover:border-white/[0.1] hover:bg-slate-100 dark:hover:bg-white/[0.04]">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${a.gradient} group-hover:scale-105 transition-transform`}>
                    <svg width={18} height={18} className="hr-icon-sm h-4.5 w-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d={a.icon} />
                    </svg>
                  </div>
                  <span className="text-[12px] font-medium text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{a.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
