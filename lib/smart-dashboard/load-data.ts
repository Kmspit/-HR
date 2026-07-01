import type { PrismaClient } from '@prisma/client'
import type { BranchScopeInput } from '@/lib/branch-scope'
import {
  attendanceWhere,
  branchNestedUserWhere,
  branchUserWhere,
  requestUserWhere,
} from '@/lib/branch-scope'
import { bangkokDateKey, startOfTodayBangkok } from '@/lib/datetime-bangkok'
import { buildAlerts, buildAIInsights } from './insights'
import type { SmartDashboardPayload, TrendPoint } from './types'

const SLOW_DASHBOARD_MS = 2_000
const CACHE_TTL_MS = 60_000

type CacheEntry = { at: number; data: SmartDashboardPayload }

const dashboardCache = new Map<string, CacheEntry>()

function cacheKey(
  scope: BranchScopeInput,
  totalEmployees: number,
  extras?: { pendingUsers?: number; overdueTasks?: number },
): string {
  return JSON.stringify({
    role: scope.role,
    branch: scope.userBranchId ?? null,
    filter: scope.filterBranchId ?? null,
    t: totalEmployees,
    p: extras?.pendingUsers ?? 0,
    o: extras?.overdueTasks ?? 0,
  })
}

const DAY_MS = 86_400_000

function dayStartOffset(daysAgo: number): Date {
  return new Date(startOfTodayBangkok().getTime() - daysAgo * DAY_MS)
}

function dayLabel(d: Date): string {
  const key = bangkokDateKey(d)
  const [, m, day] = key.split('-')
  const dow = new Intl.DateTimeFormat('th-TH', { weekday: 'short', timeZone: 'Asia/Bangkok' }).format(d)
  return `${dow} ${Number(day)}/${Number(m)}`
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null
  return Math.round(((current - previous) / previous) * 100)
}

function isWeekendBangkok(d: Date): boolean {
  const dow = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Asia/Bangkok' }).format(d)
  return dow === 'Sat' || dow === 'Sun'
}

function countOnLeaveForDay(
  dayStart: Date,
  dayEnd: Date,
  leaves: { startDate: Date; endDate: Date; status: string }[],
): number {
  let count = 0
  for (const leave of leaves) {
    if (!['APPROVED', 'ADMIN_APPROVED'].includes(leave.status)) continue
    if (leave.startDate <= dayEnd && leave.endDate >= dayStart) count += 1
  }
  return count
}

export async function loadSmartDashboardData(
  prisma: PrismaClient,
  scope: BranchScopeInput,
  totalEmployees: number,
  extras?: { pendingUsers?: number; overdueTasks?: number },
): Promise<SmartDashboardPayload> {
  const key = cacheKey(scope, totalEmployees, extras)
  const hit = dashboardCache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.data
  }

  const started = Date.now()
  const nestedUser = branchNestedUserWhere(scope)
  const userScope = nestedUser ? { user: nestedUser } : {}
  const todayStart = startOfTodayBangkok()
  const weekStart = dayStartOffset(6)
  const prevWeekStart = dayStartOffset(13)
  const prevWeekEnd = dayStartOffset(7)
  const thirtyDaysAgo = dayStartOffset(29)

  const attTodayWhere = attendanceWhere(scope, { date: { gte: todayStart } })
  const attWeekWhere = attendanceWhere(scope, { date: { gte: weekStart, lte: todayStart } })

  const [
    presentRows,
    lateToday,
    onLeaveToday,
    pendingLeave,
    pendingOutside,
    pendingWeekly,
    pendingForgot,
    outsideToday,
    weekAttendances,
    prevWeekAttendances,
    prevWeekLate,
    thisWeekLate,
    leavesInRange,
    leavesLast30,
    deptCounts,
  ] = await Promise.all([
    prisma.attendance.findMany({
      where: { ...attTodayWhere, checkIn: { not: null } },
      select: { userId: true },
      distinct: ['userId'],
    }),
    prisma.attendance.count({
      where: attendanceWhere(scope, {
        date: { gte: todayStart },
        OR: [{ status: 'LATE' }, { lateMinutes: { gt: 0 } }],
      }),
    }),
    prisma.leaveRequest.count({
      where: requestUserWhere(scope, {
        status: { in: ['APPROVED', 'ADMIN_APPROVED'] },
        startDate: { lte: todayStart },
        endDate: { gte: todayStart },
      }),
    }),
    prisma.leaveRequest.count({
      where: requestUserWhere(scope, {
        status: 'PENDING',
        chainConfigId: { not: null },
      }),
    }),
    prisma.outsideWorkRequest.count({
      where: {
        status: 'PENDING',
        approvalStatus: 'pending_chain',
        ...userScope,
      },
    }),
    prisma.weeklyLawyerPlan.count({
      where: { status: 'PENDING', chainConfigId: { not: null }, ...(nestedUser ? { lawyer: nestedUser } : {}) },
    }),
    prisma.forgotScanRequest.count({
      where: { status: { in: ['PENDING', 'ADMIN_APPROVED'] }, ...userScope },
    }),
    prisma.outsideWorkRequest.count({
      where: {
        status: 'APPROVED',
        date: { gte: todayStart, lt: new Date(todayStart.getTime() + DAY_MS) },
        ...userScope,
      },
    }),
    prisma.attendance.findMany({
      where: attWeekWhere,
      select: { date: true, userId: true, status: true, lateMinutes: true, checkIn: true },
    }),
    prisma.attendance.findMany({
      where: attendanceWhere(scope, { date: { gte: prevWeekStart, lt: prevWeekEnd } }),
      select: { date: true, userId: true, checkIn: true },
    }),
    prisma.attendance.count({
      where: attendanceWhere(scope, {
        date: { gte: prevWeekStart, lt: prevWeekEnd },
        OR: [{ status: 'LATE' }, { lateMinutes: { gt: 0 } }],
      }),
    }),
    prisma.attendance.count({
      where: attendanceWhere(scope, {
        date: { gte: weekStart, lte: todayStart },
        OR: [{ status: 'LATE' }, { lateMinutes: { gt: 0 } }],
      }),
    }),
    prisma.leaveRequest.findMany({
      where: requestUserWhere(scope, {
        status: { in: ['APPROVED', 'ADMIN_APPROVED', 'PENDING'] },
        startDate: { lte: todayStart },
        endDate: { gte: weekStart },
      }),
      select: { startDate: true, endDate: true, status: true },
    }),
    prisma.leaveRequest.findMany({
      where: requestUserWhere(scope, {
        status: { in: ['APPROVED', 'ADMIN_APPROVED'] },
        startDate: { gte: thirtyDaysAgo },
      }),
      select: { days: true, user: { select: { department: true } } },
    }),
    prisma.user.groupBy({
      by: ['department'],
      where: branchUserWhere(scope, { status: 'ACTIVE', department: { not: null } }),
      _count: { id: true },
    }),
  ])

  const presentToday = presentRows.length
  const absentToday = isWeekendBangkok(todayStart)
    ? 0
    : Math.max(0, totalEmployees - presentToday - onLeaveToday - outsideToday)

  const pendingApprovals = pendingLeave + pendingOutside + pendingWeekly + pendingForgot

  const overview = {
    totalEmployees,
    presentToday,
    lateToday,
    absentToday,
    pendingApprovals,
    onLeaveToday,
  }

  // Aggregate 7-day trends
  const dayKeys: string[] = []
  for (let i = 6; i >= 0; i--) {
    dayKeys.push(bangkokDateKey(dayStartOffset(i)))
  }

  const byDay = new Map<string, { present: Set<string>; late: number }>()
  for (const key of dayKeys) {
    byDay.set(key, { present: new Set(), late: 0 })
  }

  for (const row of weekAttendances) {
    const key = bangkokDateKey(row.date)
    const bucket = byDay.get(key)
    if (!bucket) continue
    if (row.checkIn) bucket.present.add(row.userId)
    if (row.status === 'LATE' || row.lateMinutes > 0) bucket.late += 1
  }

  const attendanceTrend: TrendPoint[] = dayKeys.map((key) => {
    const d = new Date(`${key}T00:00:00+07:00`)
    const dayEnd = new Date(d.getTime() + DAY_MS)
    const bucket = byDay.get(key)!
    const present = bucket.present.size
    const late = bucket.late
    const onLeave = isWeekendBangkok(d) ? 0 : countOnLeaveForDay(d, dayEnd, leavesInRange)
    const absent = isWeekendBangkok(d)
      ? 0
      : Math.max(0, totalEmployees - present - onLeave)
    return {
      day: key,
      label: dayLabel(d),
      value: present,
      present,
      late,
      absent,
    }
  })

  const lateTrend: TrendPoint[] = attendanceTrend.map((p) => ({
    day: p.day,
    label: p.label,
    value: p.late ?? 0,
  }))

  const leaveTrend: TrendPoint[] = dayKeys.map((key) => {
    const d = new Date(`${key}T00:00:00+07:00`)
    const dayEnd = new Date(d.getTime() + DAY_MS)
    let count = 0
    for (const leave of leavesInRange) {
      if (leave.startDate <= dayEnd && leave.endDate >= d) count += 1
    }
    return { day: key, label: dayLabel(d), value: count, leave: count }
  })

  // Department leave rates (30 days)
  const deptLeaveMap = new Map<string, number>()
  for (const l of leavesLast30) {
    const dept = l.user.department?.trim() || 'ไม่ระบุแผนก'
    deptLeaveMap.set(dept, (deptLeaveMap.get(dept) ?? 0) + l.days)
  }

  const deptLeaveRates = deptCounts.map((g) => {
    const dept = g.department ?? 'ไม่ระบุแผนก'
    const employees = g._count.id
    const days = deptLeaveMap.get(dept) ?? 0
    const rate = employees > 0 ? Math.round((days / employees) * 10) / 10 : 0
    return { department: dept, rate, days, employees }
  })

  const avgPresentThisWeek =
    attendanceTrend.reduce((s, p) => s + (p.present ?? 0), 0) / Math.max(attendanceTrend.length, 1)

  const prevDayKeys: string[] = []
  for (let i = 13; i >= 7; i--) prevDayKeys.push(bangkokDateKey(dayStartOffset(i)))
  const prevByDay = new Map<string, Set<string>>()
  for (const key of prevDayKeys) prevByDay.set(key, new Set())
  for (const row of prevWeekAttendances) {
    if (!row.checkIn) continue
    const key = bangkokDateKey(row.date)
    prevByDay.get(key)?.add(row.userId)
  }
  const avgPresentPrevWeek =
    prevDayKeys.reduce((s, k) => s + (prevByDay.get(k)?.size ?? 0), 0) / Math.max(prevDayKeys.length, 1)

  const lateWeekChangePct = pctChange(thisWeekLate, prevWeekLate)

  const insights = buildAIInsights({
    overview,
    lateTrend,
    leaveTrend,
    attendanceTrend,
    deptLeaveRates,
    lateWeekChangePct,
    attendanceWeekChangePct: totalEmployees > 0
      ? pctChange(
          Math.round((avgPresentThisWeek / totalEmployees) * 100),
          Math.round((avgPresentPrevWeek / totalEmployees) * 100),
        )
      : null,
  })

  const alerts = buildAlerts(overview, {
    pendingLeave,
    pendingOutside,
    pendingWeekly,
    pendingForgot,
    pendingUsers: extras?.pendingUsers ?? 0,
    overdueTasks: extras?.overdueTasks ?? 0,
  })

  const payload = {
    overview,
    alerts,
    attendanceTrend,
    leaveTrend,
    lateTrend,
    insights,
  }

  const elapsed = Date.now() - started
  if (elapsed > SLOW_DASHBOARD_MS) {
    dashboardCache.set(key, { at: Date.now(), data: payload })
    console.log(`[dashboard] loadSmartDashboardData slow ${elapsed}ms — cached ${CACHE_TTL_MS / 1000}s`)
  }

  return payload
}
