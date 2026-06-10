import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import TasksClient from './TasksClient'

const CAN_ASSIGN:  string[] = ['SUPER_ADMIN','CEO','MANAGER_HR','HR','ADMIN','MANAGER','TEAM_LEADER']
const CAN_SEE_ALL: string[] = ['SUPER_ADMIN','CEO','MANAGER_HR','HR']

const userSelect = { id: true, name: true, department: true, employeeId: true, role: true }

// JSON.stringify/parse converts Date → ISO string at runtime.
// Return type is `any` so callers can assign to string-dated client types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize(v: unknown): any { return JSON.parse(JSON.stringify(v)) }

export default async function TasksPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/')

  const role   = session.user.role as string
  const userId = session.user.id

  const myTasks = await prisma.taskAssignment.findMany({
    where:   { assigneeId: userId },
    include: { assignee: { select: userSelect }, assignedBy: { select: userSelect } },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    take: 100,
  })

  const assignedByMeTasks = CAN_ASSIGN.includes(role)
    ? await prisma.taskAssignment.findMany({
        where:   { assignedById: userId },
        include: { assignee: { select: userSelect }, assignedBy: { select: userSelect } },
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
        take: 100,
      })
    : []

  const allTasks = CAN_SEE_ALL.includes(role)
    ? await prisma.taskAssignment.findMany({
        include: { assignee: { select: userSelect }, assignedBy: { select: userSelect } },
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
        take: 200,
      })
    : []

  const employees = CAN_ASSIGN.includes(role)
    ? await prisma.user.findMany({
        where: {
          status: 'ACTIVE',
          ...(role === 'TEAM_LEADER' ? { teamLeaderId: userId } : {}),
          ...(role === 'MANAGER'     ? { managerId:    userId } : {}),
        },
        select:  userSelect,
        orderBy: { name: 'asc' },
      })
    : []

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
