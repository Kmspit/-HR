import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

const CAN_SEE_ALL  = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR']
const CAN_SEE_TEAM = ['MANAGER', 'TEAM_LEADER', ...CAN_SEE_ALL]

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role   = session.user.role
  const userId = session.user.id

  if (!CAN_SEE_TEAM.includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const department = searchParams.get('department') ?? undefined
  const teamUserId = searchParams.get('userId') ?? undefined
  const dateFrom   = searchParams.get('dateFrom') ?? undefined
  const dateTo     = searchParams.get('dateTo')   ?? undefined

  const now = new Date()

  // Build the base where clause depending on role
  type WhereClause = Record<string, unknown>
  const baseWhere: WhereClause = {}

  if (CAN_SEE_ALL.includes(role)) {
    // Full admins: can filter by dept or userId param
    if (department)  baseWhere.taskDepartment = department
    if (teamUserId)  baseWhere.assigneeId = teamUserId
  } else if (role === 'MANAGER') {
    // Managers: see their managed employees
    const managed = await prisma.user.findMany({
      where: { managerId: userId },
      select: { id: true },
    })
    const ids = managed.map(u => u.id)
    baseWhere.assigneeId = { in: ids }
  } else if (role === 'TEAM_LEADER') {
    // Team leaders: see their team members
    const members = await prisma.user.findMany({
      where: { teamLeaderId: userId },
      select: { id: true },
    })
    const ids = members.map(u => u.id)
    baseWhere.assigneeId = { in: ids }
  }

  // Date range filter
  if (dateFrom || dateTo) {
    const createdAt: WhereClause = {}
    if (dateFrom) createdAt.gte = new Date(dateFrom)
    if (dateTo)   createdAt.lte = new Date(dateTo)
    baseWhere.createdAt = createdAt
  }

  // Counts
  const [total, completed, overdue, inProgress, waitingReview, waitingApproval, highPriority] =
    await Promise.all([
      prisma.taskAssignment.count({ where: baseWhere }),
      prisma.taskAssignment.count({ where: { ...baseWhere, status: 'COMPLETED' } }),
      prisma.taskAssignment.count({
        where: {
          ...baseWhere,
          dueDate: { lt: now },
          status: { notIn: ['COMPLETED', 'CANCELLED', 'REJECTED'] },
        },
      }),
      prisma.taskAssignment.count({ where: { ...baseWhere, status: 'IN_PROGRESS' } }),
      prisma.taskAssignment.count({ where: { ...baseWhere, status: 'WAITING_REVIEW' } }),
      prisma.taskAssignment.count({ where: { ...baseWhere, status: 'WAITING_APPROVAL' } }),
      prisma.taskAssignment.count({
        where: {
          ...baseWhere,
          priority: { in: ['HIGH', 'URGENT'] },
          status: { notIn: ['COMPLETED', 'CANCELLED', 'REJECTED'] },
        },
      }),
    ])

  // Average completion time (hours) — tasks with reviewedAt and createdAt
  const completedTasks = await prisma.taskAssignment.findMany({
    where: { ...baseWhere, status: 'COMPLETED', reviewedAt: { not: null } },
    select: { createdAt: true, reviewedAt: true },
    take: 500,
  })
  const avgCompletionHours = completedTasks.length > 0
    ? completedTasks.reduce((sum, t) => {
        const ms = (t.reviewedAt!.getTime() - t.createdAt.getTime())
        return sum + ms / (1000 * 60 * 60)
      }, 0) / completedTasks.length
    : 0

  const overdueRate  = total > 0 ? Math.round((overdue  / total) * 100) : 0
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0

  // Per-employee breakdown for managers/CEO
  let byEmployee: unknown[] = []
  if (CAN_SEE_TEAM.includes(role)) {
    const empGroups = await prisma.taskAssignment.groupBy({
      by: ['assigneeId'],
      where: baseWhere,
      _count: { id: true },
    })

    const empIds = empGroups.map(g => g.assigneeId)
    const users = await prisma.user.findMany({
      where: { id: { in: empIds } },
      select: { id: true, name: true, department: true, role: true },
    })

    const completedByEmp = await prisma.taskAssignment.groupBy({
      by: ['assigneeId'],
      where: { ...baseWhere, status: 'COMPLETED' },
      _count: { id: true },
    })
    const overdueByEmp = await prisma.taskAssignment.groupBy({
      by: ['assigneeId'],
      where: {
        ...baseWhere,
        dueDate: { lt: now },
        status: { notIn: ['COMPLETED', 'CANCELLED', 'REJECTED'] },
      },
      _count: { id: true },
    })

    const completedMap = Object.fromEntries(completedByEmp.map(r => [r.assigneeId, r._count.id]))
    const overdueMap   = Object.fromEntries(overdueByEmp.map(r => [r.assigneeId, r._count.id]))

    byEmployee = empGroups.map(g => {
      const user = users.find(u => u.id === g.assigneeId)
      const emp_completed = completedMap[g.assigneeId] ?? 0
      const emp_overdue   = overdueMap[g.assigneeId]   ?? 0
      const emp_total     = g._count.id
      return {
        userId:         g.assigneeId,
        name:           user?.name ?? g.assigneeId,
        department:     user?.department,
        role:           user?.role,
        total:          emp_total,
        completed:      emp_completed,
        overdue:        emp_overdue,
        completionRate: emp_total > 0 ? Math.round((emp_completed / emp_total) * 100) : 0,
        overdueRate:    emp_total > 0 ? Math.round((emp_overdue   / emp_total) * 100) : 0,
      }
    }).sort((a, b) => b.overdue - a.overdue)
  }

  // By department (CEO only)
  let byDepartment: unknown[] = []
  if (CAN_SEE_ALL.includes(role)) {
    const deptGroups = await prisma.taskAssignment.groupBy({
      by: ['taskDepartment'],
      where: baseWhere,
      _count: { id: true },
    })
    const deptCompleted = await prisma.taskAssignment.groupBy({
      by: ['taskDepartment'],
      where: { ...baseWhere, status: 'COMPLETED' },
      _count: { id: true },
    })
    const deptOverdue = await prisma.taskAssignment.groupBy({
      by: ['taskDepartment'],
      where: {
        ...baseWhere,
        dueDate: { lt: now },
        status: { notIn: ['COMPLETED', 'CANCELLED', 'REJECTED'] },
      },
      _count: { id: true },
    })
    const deptCompletedMap = Object.fromEntries(deptCompleted.map(r => [r.taskDepartment ?? '', r._count.id]))
    const deptOverdueMap   = Object.fromEntries(deptOverdue.map(r => [r.taskDepartment ?? '', r._count.id]))

    byDepartment = deptGroups.map(g => {
      const key = g.taskDepartment ?? 'ไม่ระบุ'
      const d_total = g._count.id
      const d_completed = deptCompletedMap[g.taskDepartment ?? ''] ?? 0
      const d_overdue   = deptOverdueMap[g.taskDepartment ?? '']   ?? 0
      return {
        department:     key,
        total:          d_total,
        completed:      d_completed,
        overdue:        d_overdue,
        completionRate: d_total > 0 ? Math.round((d_completed / d_total) * 100) : 0,
        overdueRate:    d_total > 0 ? Math.round((d_overdue   / d_total) * 100) : 0,
      }
    }).sort((a, b) => b.total - a.total)
  }

  return NextResponse.json({
    summary: {
      total,
      completed,
      overdue,
      inProgress,
      waitingReview,
      waitingApproval,
      highPriority,
      completionRate,
      overdueRate,
      avgCompletionHours: Math.round(avgCompletionHours * 10) / 10,
    },
    byEmployee,
    byDepartment,
    generatedAt: now.toISOString(),
  })
}
