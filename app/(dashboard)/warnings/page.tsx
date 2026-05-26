import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import WarningsClient from './WarningsClient'

export default async function WarningsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/')

  const isManager = ['MANAGER_HR', 'ADMIN'].includes(session.user.role)

  const [warnings, employees] = await Promise.all([
    prisma.warning.findMany({
      where: isManager ? {} : { userId: session.user.id },
      include: { user: { select: { name: true, employeeId: true, department: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    isManager
      ? prisma.user.findMany({
          where: {
            status: 'ACTIVE',
            role: { in: ['EMPLOYEE', 'MANAGER_HR', 'LAWYER'] },
          },
          select: {
            id: true,
            name: true,
            department: true,
            employeeId: true,
            _count: { select: { warnings: true } },
          },
          orderBy: { name: 'asc' },
        })
      : [],
  ])

  return (
    <WarningsClient
      isManager={isManager}
      warnings={warnings.map((w) => ({
        id: w.id,
        userId: w.userId,
        userName: w.user.name,
        userDept: w.user.department ?? '',
        employeeId: w.user.employeeId ?? '',
        level: w.level,
        reason: w.reason,
        description: w.description ?? '',
        isAuto: w.isAuto,
        month: w.month ?? null,
        year: w.year ?? null,
        createdAt: w.createdAt.toISOString(),
      }))}
      employees={employees.map((e) => ({
        id: e.id,
        name: e.name,
        department: e.department ?? '',
        employeeId: e.employeeId ?? '',
        warningCount: e._count.warnings,
      }))}
    />
  )
}
