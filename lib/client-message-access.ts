import { prisma } from '@/lib/prisma'
import type { Role } from '@prisma/client'

const STAFF_MESSAGE_ROLES: Role[] = [
  'SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER',
  'EMPLOYEE', 'LAWYER', 'ENFORCEMENT',
]

export function isStaffMessageRole(role: Role): boolean {
  return STAFF_MESSAGE_ROLES.includes(role)
}

const HR_MESSAGE_ROLES: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

/** Staff may read/reply only if HR-wide or assigned to a task for this client. */
export async function staffCanAccessClientMessages(
  staffId: string,
  staffRole: Role,
  clientUserId: string,
  taskId?: string | null,
): Promise<boolean> {
  if (!isStaffMessageRole(staffRole)) return false
  if (HR_MESSAGE_ROLES.includes(staffRole)) return true

  if (taskId) {
    const task = await prisma.taskAssignment.findFirst({
      where: {
        id: taskId,
        clientId: clientUserId,
        OR: [{ assigneeId: staffId }, { assignedById: staffId }],
      },
      select: { id: true },
    })
    return !!task
  }

  const linked = await prisma.taskAssignment.findFirst({
    where: {
      clientId: clientUserId,
      OR: [{ assigneeId: staffId }, { assignedById: staffId }],
    },
    select: { id: true },
  })
  return !!linked
}

/** Map portal session to legacy CLIENT User id for ClientMessage rows. */
export async function resolveClientUserIdForPortal(
  email: string,
  clientCompanyId: string,
): Promise<string | null> {
  const byEmail = await prisma.user.findFirst({
    where: { role: 'CLIENT', email, status: 'ACTIVE' },
    select: { id: true },
  })
  if (byEmail) return byEmail.id

  const task = await prisma.taskAssignment.findFirst({
    where: { clientCompanyId, clientId: { not: null } },
    select: { clientId: true },
  })
  return task?.clientId ?? null
}
