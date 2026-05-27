import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const employees = await prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        role: { in: ['EMPLOYEE', 'MANAGER_HR', 'LAWYER'] },
      },
      select: {
        id: true,
        name: true,
        department: true,
        employeeId: true,
        position: true,
        _count: { select: { warnings: true } },
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({
      employees: employees.map((e) => ({
        id: e.id,
        name: e.name,
        department: e.department ?? '',
        position: e.position ?? '',
        employeeId: e.employeeId ?? '',
        warningCount: e._count.warnings,
      })),
    })
  } catch (err) {
    return apiError(err)
  }
}
