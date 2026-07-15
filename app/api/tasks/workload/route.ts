import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { WORKLOAD_STATUS_LABEL as STATUS_LABEL_TH } from '@/lib/status-labels'
import { apiError } from '@/lib/api-handler'

const ACTIVE_STATUSES = [
  'PENDING', 'NEW', 'ASSIGNED', 'IN_PROGRESS',
  'WAITING_DOC', 'WAITING_REVIEW', 'REVISION', 'WAITING_APPROVAL',
] as const

function calcWorkloadStatus(score: number): 'LOW' | 'NORMAL' | 'HIGH' | 'OVERLOADED' {
  if (score <= 5)  return 'LOW'
  if (score <= 15) return 'NORMAL'
  if (score <= 25) return 'HIGH'
  return 'OVERLOADED'
}


export async function GET(req: Request) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId') ?? undefined
  const role   = session.user.role

  // Determine which users to calculate workload for
  let userIds: string[] = []

  if (userId) {
    // Specific user — allowed for self or managers
    userIds = [userId]
  } else if (['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR'].includes(role)) {
    const users = await prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    })
    userIds = users.map((u) => u.id)
  } else if (role === 'MANAGER') {
    const managed = await prisma.user.findMany({
      where: { managerId: session.user.id },
      select: { id: true },
    })
    userIds = [session.user.id, ...managed.map((u) => u.id)]
  } else if (role === 'TEAM_LEADER') {
    const members = await prisma.user.findMany({
      where: { teamLeaderId: session.user.id },
      select: { id: true },
    })
    userIds = [session.user.id, ...members.map((u) => u.id)]
  } else {
    userIds = [session.user.id]
  }

  // Fetch all active tasks for these users in one query
  const now = new Date()
  const tasks = await prisma.taskAssignment.findMany({
    where: {
      assigneeId: { in: userIds },
      status:     { in: [...ACTIVE_STATUSES] },
    },
    select: {
      assigneeId: true,
      status:     true,
      priority:   true,
      dueDate:    true,
    },
  })

  // Fetch user info
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, department: true, role: true },
  })

  const workloadByUser = users.map((u) => {
    const userTasks = tasks.filter((t) => t.assigneeId === u.id)

    const activeCount  = userTasks.length
    const overdueCount = userTasks.filter((t) => t.dueDate && new Date(t.dueDate) < now).length
    const urgentCount  = userTasks.filter((t) => ['HIGH', 'URGENT'].includes(t.priority)).length
    const waitingCount = userTasks.filter((t) => ['WAITING_REVIEW', 'WAITING_APPROVAL'].includes(t.status)).length

    const score = activeCount + (overdueCount * 2) + (urgentCount * 1.5) + (waitingCount * 0.5)
    const status = calcWorkloadStatus(score)

    return {
      userId:      u.id,
      name:        u.name,
      department:  u.department,
      role:        u.role,
      activeCount,
      overdueCount,
      urgentCount,
      waitingCount,
      score:       Math.round(score * 10) / 10,
      status,
      statusLabel: STATUS_LABEL_TH[status],
    }
  })

  // Sort by score descending
  workloadByUser.sort((a, b) => b.score - a.score)

  return NextResponse.json({ workload: workloadByUser })
} catch (err) {
  return apiError(err)
 }
}
