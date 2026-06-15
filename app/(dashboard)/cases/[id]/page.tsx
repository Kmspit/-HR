import { auth } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import CaseDetailClient from './CaseDetailClient'

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const { id } = await params

  const EXEC = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']
  const { role, id: userId, department } = session.user

  const c = await prisma.case.findUnique({
    where: { id },
    include: {
      assignedEmployee: { select: { id: true, name: true, department: true, employeeId: true, role: true } },
      createdBy:        { select: { id: true, name: true, department: true, employeeId: true, role: true } },
      client:  true,
      debtor:  true,
      courts:  { orderBy: { courtDate: 'asc' }, include: { createdBy: { select: { id: true, name: true } } } },
      timeline: {
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { id: true, name: true, role: true } } },
      },
      tasks: {
        select: {
          id: true, title: true, status: true, priority: true, dueDate: true, type: true,
          assignee: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
      checklists:       { include: { doneBy: { select: { id: true, name: true } } }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      debtorActivities: { include: { actor: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: 'desc' }, take: 30 },
      financial:        { include: { updatedBy: { select: { id: true, name: true } } } },
      _count: { select: { tasks: true, courts: true, checklists: true } },
    },
  })

  if (!c) notFound()

  // Permission check
  const canAccess =
    EXEC.includes(role) ||
    c.createdById === userId ||
    c.assignedEmployeeId === userId ||
    (role === 'MANAGER' && department && c.department === department)

  if (!canAccess) redirect('/cases')

  const canEdit =
    EXEC.includes(role) ||
    c.createdById === userId ||
    !!(role === 'MANAGER' && department && c.department === department)

  return (
    <CaseDetailClient
      initialCase={JSON.parse(JSON.stringify(c))}
      role={role}
      userId={userId}
      canEdit={canEdit}
      cloudName={process.env.CLOUDINARY_CLOUD_NAME ?? ''}
    />
  )
}
