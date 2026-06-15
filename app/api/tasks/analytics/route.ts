import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

const EXEC_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR']
const DEPTS = [
  { key: 'DEBT',    label: 'ฝ่ายเร่งรัดหนี้' },
  { key: 'LAW',     label: 'ฝ่ายกฎหมาย' },
  { key: 'ASSET',   label: 'ฝ่ายสืบทรัพย์' },
  { key: 'ENFORCE', label: 'ฝ่ายบังคับคดี' },
]

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = session.user.role
  if (!EXEC_ROLES.includes(role) && !['MANAGER', 'TEAM_LEADER', 'ADMIN'].includes(role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const now = new Date()

  // Scope: MANAGER sees their team; execs see all
  let teamUserIds: string[] | null = null
  if (role === 'MANAGER') {
    const managed = await prisma.user.findMany({
      where: { managerId: session.user.id },
      select: { id: true },
    })
    teamUserIds = [session.user.id, ...managed.map((u) => u.id)]
  } else if (role === 'TEAM_LEADER') {
    const members = await prisma.user.findMany({
      where: { teamLeaderId: session.user.id },
      select: { id: true },
    })
    teamUserIds = [session.user.id, ...members.map((u) => u.id)]
  }

  const baseWhere = teamUserIds ? { assigneeId: { in: teamUserIds } } : {}

  // Dept breakdown
  const byDepartment = await Promise.all(
    DEPTS.map(async ({ key, label }) => {
      const [total, completed, overdue] = await Promise.all([
        prisma.taskAssignment.count({ where: { ...baseWhere, taskDepartment: key } }),
        prisma.taskAssignment.count({ where: { ...baseWhere, taskDepartment: key, status: 'COMPLETED' } }),
        prisma.taskAssignment.count({
          where: {
            ...baseWhere, taskDepartment: key,
            dueDate: { lt: now },
            status: { notIn: ['COMPLETED', 'CANCELLED', 'REJECTED'] },
          },
        }),
      ])
      return {
        dept:           key,
        label,
        total,
        completed,
        overdue,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
        overdueRate:    total > 0 ? Math.round((overdue / total) * 100)   : 0,
      }
    })
  )

  // Bottleneck statuses (where tasks accumulate)
  const BOTTLENECK_STATUSES = ['WAITING_REVIEW', 'WAITING_APPROVAL', 'WAITING_DOC', 'REVISION']
  const bottleneck = await Promise.all(
    BOTTLENECK_STATUSES.map(async (status) => {
      const count = await prisma.taskAssignment.count({ where: { ...baseWhere, status: status as never } })
      return { status, count }
    })
  )

  // High-risk overdue tasks (priority HIGH/URGENT, not done)
  const highRiskTasks = await prisma.taskAssignment.findMany({
    where: {
      ...baseWhere,
      dueDate:  { lt: now },
      priority: { in: ['HIGH', 'URGENT'] },
      status:   { notIn: ['COMPLETED', 'CANCELLED', 'REJECTED'] },
    },
    select: {
      id: true, title: true, priority: true, dueDate: true, caseNumber: true,
      taskDepartment: true,
      assignee: { select: { id: true, name: true } },
    },
    orderBy: { dueDate: 'asc' },
    take: 20,
  })

  const highRisk = highRiskTasks.map((t) => {
    const daysLate = t.dueDate
      ? Math.floor((now.getTime() - new Date(t.dueDate).getTime()) / 86400000)
      : 0
    return {
      id:           t.id,
      title:        t.title,
      priority:     t.priority,
      daysLate,
      caseNumber:   t.caseNumber,
      department:   t.taskDepartment,
      assigneeName: t.assignee.name,
    }
  })

  // Summary totals
  const [totalTasks, completedTasks, overdueTasks] = await Promise.all([
    prisma.taskAssignment.count({ where: baseWhere }),
    prisma.taskAssignment.count({ where: { ...baseWhere, status: 'COMPLETED' } }),
    prisma.taskAssignment.count({
      where: {
        ...baseWhere,
        dueDate: { lt: now },
        status:  { notIn: ['COMPLETED', 'CANCELLED', 'REJECTED'] },
      },
    }),
  ])

  // Rejected 3+ times (needs CEO attention)
  const rejectedMany = await prisma.taskAssignment.findMany({
    where: { ...baseWhere, rejectedCount: { gte: 3 } },
    select: {
      id: true, title: true, rejectedCount: true, caseNumber: true,
      assignee: { select: { id: true, name: true } },
    },
    orderBy: { rejectedCount: 'desc' },
    take: 10,
  })

  return NextResponse.json({
    summary: {
      total:          totalTasks,
      completed:      completedTasks,
      overdue:        overdueTasks,
      completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      overdueRate:    totalTasks > 0 ? Math.round((overdueTasks  / totalTasks) * 100)  : 0,
    },
    byDepartment,
    bottleneck: bottleneck.filter((b) => b.count > 0),
    highRisk,
    rejectedMany,
  })
}
