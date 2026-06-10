import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import TasksClient from './TasksClient'

export default async function TasksPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/')

  const role   = session.user.role
  const userId = session.user.id

  const CAN_ASSIGN   = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']
  const CAN_SEE_ALL  = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR']

  // Fetch tasks visible to current user
  const myTasks = await prisma.taskAssignment.findMany({
    where: { assigneeId: userId },
    include: {
      assignee:   { select: { id: true, name: true, department: true, employeeId: true, role: true } },
      assignedBy: { select: { id: true, name: true, department: true, employeeId: true, role: true } },
    },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    take: 100,
  })

  const assignedByMeTasks = CAN_ASSIGN.includes(role) ? await prisma.taskAssignment.findMany({
    where: { assignedById: userId },
    include: {
      assignee:   { select: { id: true, name: true, department: true, employeeId: true, role: true } },
      assignedBy: { select: { id: true, name: true, department: true, employeeId: true, role: true } },
    },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    take: 100,
  }) : []

  const allTasks = CAN_SEE_ALL.includes(role) ? await prisma.taskAssignment.findMany({
    include: {
      assignee:   { select: { id: true, name: true, department: true, employeeId: true, role: true } },
      assignedBy: { select: { id: true, name: true, department: true, employeeId: true, role: true } },
    },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    take: 200,
  }) : []

  // Employee list for assignment (only if assigner role)
  const employees = CAN_ASSIGN.includes(role) ? await prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      ...(role === 'TEAM_LEADER' ? { teamLeaderId: userId } : {}),
      ...(role === 'MANAGER'     ? { managerId:    userId } : {}),
    },
    select: { id: true, name: true, department: true, employeeId: true, role: true },
    orderBy: { name: 'asc' },
  }) : []

  const serialize = <T>(v: T): T => JSON.parse(JSON.stringify(v))

  return (
    <TasksClient
      role={role}
      userId={userId}
      userName={session.user.name ?? 'พนักงาน'}
      myTasks={serialize(myTasks)}
      assignedByMeTasks={serialize(assignedByMeTasks)}
      allTasks={serialize(allTasks)}
      employees={serialize(employees)}
      canAssign={CAN_ASSIGN.includes(role)}
      canSeeAll={CAN_SEE_ALL.includes(role)}
    />
  )
}
