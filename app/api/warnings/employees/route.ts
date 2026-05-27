import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { WARNING_TARGET_USER_SELECT, WARNING_TARGET_USER_WHERE } from '@/lib/warning-employees'
import { ROLE_LABELS } from '@/lib/permissions'

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
      where: WARNING_TARGET_USER_WHERE,
      select: WARNING_TARGET_USER_SELECT,
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({
      employees: employees.map((e) => ({
        id: e.id,
        name: e.name,
        department: e.department ?? '',
        position: e.position ?? '',
        employeeId: e.employeeId ?? '',
        role: e.role,
        roleLabel: ROLE_LABELS[e.role],
        warningCount: e._count.warnings,
      })),
    })
  } catch (err) {
    return apiError(err)
  }
}
