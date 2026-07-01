import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { listAttendanceTeamUsers } from '@/lib/attendance-team-users'
import { buildBranchScope, branchUserWhere, parseBranchQueryParam } from '@/lib/branch-scope'
import { canListCompanyWideRecords, resolveOrgListScope } from '@/lib/org-scope'
import { canManageAttendance } from '@/lib/access-control'

/** รายชื่อพนักงานสำหรับ dropdown รายงานลงเวลา — org-scoped */
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const role = session.user.role
    if (!canListCompanyWideRecords(role) && !canManageAttendance(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const branchParam = parseBranchQueryParam(
      new URL(req.url).searchParams.get('branchId') ?? undefined,
    )
    const scope = buildBranchScope(session.user, { branchId: branchParam })

    let employees
    if (canListCompanyWideRecords(role)) {
      employees = await listAttendanceTeamUsers(scope)
    } else {
      const ids = await resolveOrgListScope(prisma, session.user.id, role)
      if (ids === 'ALL') {
        employees = await listAttendanceTeamUsers(scope)
      } else {
        employees = await prisma.user.findMany({
          where: branchUserWhere(scope, { id: { in: ids } }),
          select: {
            id: true,
            name: true,
            employeeId: true,
            status: true,
            department: true,
          },
          orderBy: [{ status: 'asc' }, { name: 'asc' }],
        })
      }
    }

    return NextResponse.json({
      employees: employees.map((e) => ({
        id: e.id,
        name: e.name,
        employeeId: e.employeeId,
        status: e.status,
        department: e.department,
      })),
      total: employees.length,
    })
  } catch (err) {
    return apiError(err)
  }
}
