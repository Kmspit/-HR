import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { canAccessExecutiveApi } from '@/lib/executive-api'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessExecutiveApi(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const now        = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd   = new Date(todayStart.getTime() + 86_400_000 - 1)

  const [
    taskStats,
    taskCompletedStats,
    recoveryByUser,
    lateByUser,
    totalAttendance,
    presentToday,
    activeEmployees,
  ] = await Promise.all([
    prisma.taskAssignment.groupBy({
      by: ['assigneeId'],
      where: { createdAt: { gte: monthStart } },
      _count: { id: true },
    }),
    prisma.taskAssignment.groupBy({
      by: ['assigneeId'],
      where: {
        status: 'COMPLETED',
        updatedAt: { gte: monthStart },
      },
      _count: { id: true },
    }),
    prisma.recoveryPayment.groupBy({
      by: ['collectorId'],
      where: { paymentDate: { gte: monthStart }, status: 'CONFIRMED' },
      _sum: { amount: true },
      _count: { id: true },
      orderBy: { _sum: { amount: 'desc' } },
    }),
    prisma.attendance.groupBy({
      by: ['userId'],
      where: {
        date: { gte: monthStart },
        lateMinutes: { gt: 0 },
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    }),
    prisma.attendance.groupBy({
      by: ['userId'],
      where: { date: { gte: monthStart } },
      _count: { id: true },
    }),
    prisma.attendance.count({
      where: { date: { gte: todayStart, lte: todayEnd }, checkIn: { not: null } },
    }),
    prisma.user.count({ where: { status: 'ACTIVE' } }),
  ])

  const users = await prisma.user.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, department: true, role: true, employeeId: true },
  })
  const userMap = Object.fromEntries(users.map(u => [u.id, u]))

  // Build task completion map
  const taskTotalMap    = Object.fromEntries(taskStats.map(r => [r.assigneeId, r._count.id]))
  const taskDoneMap     = Object.fromEntries(taskCompletedStats.map(r => [r.assigneeId, r._count.id]))
  const lateCountMap    = Object.fromEntries(lateByUser.map(r => [r.userId, r._count.id]))
  const totalAttMap     = Object.fromEntries(totalAttendance.map(r => [r.userId, r._count.id]))

  // Build leaderboard
  const recoveryMap = Object.fromEntries(recoveryByUser.map(r => [r.collectorId, r._sum.amount ?? 0]))

  const leaderboard = users.map(u => {
    const total     = taskTotalMap[u.id]    ?? 0
    const done      = taskDoneMap[u.id]     ?? 0
    const lateCount = lateCountMap[u.id]    ?? 0
    const attTotal  = totalAttMap[u.id]     ?? 0
    const recovery  = recoveryMap[u.id]     ?? 0

    return {
      userId:          u.id,
      name:            u.name,
      department:      u.department,
      role:            u.role,
      tasksTotal:      total,
      tasksCompleted:  done,
      completionRate:  total > 0 ? Math.round((done / total) * 100) : 0,
      lateCount,
      attendancePct:   attTotal > 0 ? Math.round(((attTotal - lateCount) / attTotal) * 100) : 100,
      recoveryAmount:  recovery ?? 0,
    }
  })

  leaderboard.sort((a, b) => b.completionRate - a.completionRate)

  // Department aggregates — in-memory from existing query results (no extra DB queries)
  const depts = ['Legal', 'Collection', 'Enforcement', 'HR', 'Admin']
  const deptStats = depts.map(dept => {
    const deptUserIds = new Set(users.filter(u => u.department === dept).map(u => u.id))

    const tasksTotal = taskStats
      .filter(r => deptUserIds.has(r.assigneeId))
      .reduce((sum, r) => sum + r._count.id, 0)

    const tasksCompleted = taskCompletedStats
      .filter(r => deptUserIds.has(r.assigneeId))
      .reduce((sum, r) => sum + r._count.id, 0)

    const lateCount = lateByUser
      .filter(r => deptUserIds.has(r.userId))
      .reduce((sum, r) => sum + r._count.id, 0)

    const totalAtt = totalAttendance
      .filter(r => deptUserIds.has(r.userId))
      .reduce((sum, r) => sum + r._count.id, 0)

    const recoveryAmount = recoveryByUser
      .filter(r => deptUserIds.has(r.collectorId))
      .reduce((sum, r) => sum + (r._sum.amount ?? 0), 0)

    return {
      dept,
      tasksTotal,
      tasksCompleted,
      completionRate: tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0,
      lateCount,
      attendancePct:  totalAtt > 0 ? Math.round(((totalAtt - lateCount) / totalAtt) * 100) : 100,
      recoveryAmount,
    }
  })

  // Top/bottom 5 performers
  const topPerformers    = [...leaderboard].sort((a, b) => b.completionRate - a.completionRate).slice(0, 5)
  const bottomPerformers = [...leaderboard].filter(u => u.tasksTotal > 0).sort((a, b) => a.completionRate - b.completionRate).slice(0, 5)
  const topCollectors    = [...leaderboard].sort((a, b) => b.recoveryAmount - a.recoveryAmount).slice(0, 5)
  const frequentLate     = [...leaderboard].sort((a, b) => b.lateCount - a.lateCount).filter(u => u.lateCount > 0).slice(0, 5)

  return NextResponse.json({
    summary: { presentToday, activeEmployees },
    deptStats,
    leaderboard: {
      topPerformers,
      bottomPerformers,
      topCollectors,
      frequentLate,
    },
  }, {
    headers: {
      'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
      'Vary': 'Cookie',
    },
  })
}
