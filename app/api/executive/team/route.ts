import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

const ALLOWED_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER']

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ALLOWED_ROLES.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const now        = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd   = new Date(todayStart.getTime() + 86_400_000 - 1)

  const deptScope = session.user.role === 'MANAGER' && session.user.department
    ? session.user.department
    : null

  // Task completion by user (this month)
  const taskStats = await prisma.taskAssignment.groupBy({
    by: ['assigneeId'],
    where: {
      createdAt: { gte: monthStart },
      ...(deptScope ? { assignee: { department: deptScope } } : {}),
    },
    _count: { id: true },
  })

  const taskCompletedStats = await prisma.taskAssignment.groupBy({
    by: ['assigneeId'],
    where: {
      status: 'COMPLETED',
      updatedAt: { gte: monthStart },
      ...(deptScope ? { assignee: { department: deptScope } } : {}),
    },
    _count: { id: true },
  })

  // Recovery by user (this month)
  const recoveryByUser = await prisma.recoveryPayment.groupBy({
    by: ['collectorId'],
    where: { paymentDate: { gte: monthStart }, status: 'CONFIRMED' },
    _sum: { amount: true },
    _count: { id: true },
    orderBy: { _sum: { amount: 'desc' } },
    take: 20,
  })

  // Attendance this month (late count per user)
  const lateByUser = await prisma.attendance.groupBy({
    by: ['userId'],
    where: {
      date: { gte: monthStart },
      lateMinutes: { gt: 0 },
      ...(deptScope ? { user: { department: deptScope } } : {}),
    },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 20,
  })

  const totalAttendance = await prisma.attendance.groupBy({
    by: ['userId'],
    where: {
      date: { gte: monthStart },
      ...(deptScope ? { user: { department: deptScope } } : {}),
    },
    _count: { id: true },
  })

  // Today's attendance
  const presentToday = await prisma.attendance.count({
    where: { date: { gte: todayStart, lte: todayEnd }, checkIn: { not: null } },
  })

  // Active employee count
  const activeEmployees = await prisma.user.count({
    where: {
      status: 'ACTIVE',
      ...(deptScope ? { department: deptScope } : {}),
    },
  })

  // Collect all user IDs we need
  const allUserIds = new Set<string>([
    ...taskStats.map(r => r.assigneeId),
    ...taskCompletedStats.map(r => r.assigneeId),
    ...recoveryByUser.map(r => r.collectorId),
    ...lateByUser.map(r => r.userId),
  ])

  const users = await prisma.user.findMany({
    where: { id: { in: [...allUserIds] } },
    select: { id: true, name: true, department: true, role: true, employeeId: true },
  })
  const userMap = Object.fromEntries(users.map(u => [u.id, u]))

  // Build task completion map
  const taskTotalMap    = Object.fromEntries(taskStats.map(r => [r.assigneeId, r._count.id]))
  const taskDoneMap     = Object.fromEntries(taskCompletedStats.map(r => [r.assigneeId, r._count.id]))
  const lateCountMap    = Object.fromEntries(lateByUser.map(r => [r.userId, r._count.id]))
  const totalAttMap     = Object.fromEntries(totalAttendance.map(r => [r.userId, r._count.id]))

  // Build leaderboard
  const leaderboard = users.map(u => {
    const total     = taskTotalMap[u.id]    ?? 0
    const done      = taskDoneMap[u.id]     ?? 0
    const lateCount = lateCountMap[u.id]    ?? 0
    const attTotal  = totalAttMap[u.id]     ?? 0
    const recovery  = recoveryByUser.find(r => r.collectorId === u.id)?._sum?.amount ?? 0

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

  // Department aggregates
  const depts = ['Legal', 'Collection', 'Enforcement', 'HR', 'Admin']
  const deptStats = await Promise.all(
    depts.map(async dept => {
      const [taskTotal, taskDone, lateCount, totalAtt, recovery] = await Promise.all([
        prisma.taskAssignment.count({ where: { createdAt: { gte: monthStart }, assignee: { department: dept } } }),
        prisma.taskAssignment.count({ where: { status: 'COMPLETED', updatedAt: { gte: monthStart }, assignee: { department: dept } } }),
        prisma.attendance.count({ where: { date: { gte: monthStart }, lateMinutes: { gt: 0 }, user: { department: dept } } }),
        prisma.attendance.count({ where: { date: { gte: monthStart }, user: { department: dept } } }),
        prisma.recoveryPayment.aggregate({ where: { paymentDate: { gte: monthStart }, status: 'CONFIRMED', collector: { department: dept } }, _sum: { amount: true } }),
      ])
      return {
        dept,
        tasksTotal:     taskTotal,
        tasksCompleted: taskDone,
        completionRate: taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : 0,
        lateCount,
        attendancePct:  totalAtt > 0 ? Math.round(((totalAtt - lateCount) / totalAtt) * 100) : 100,
        recoveryAmount: recovery._sum.amount ?? 0,
      }
    })
  )

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
  })
}
