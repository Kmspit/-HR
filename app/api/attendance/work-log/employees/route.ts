import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { apiError } from '@/lib/api-handler'
import { listAttendanceTeamUsers } from '@/lib/attendance-team-users'
import { buildBranchScope, parseBranchQueryParam } from '@/lib/branch-scope'

/** รายชื่อพนักงานสำหรับ dropdown รายงานลงเวลา — อัปเดตทุกครั้งที่เรียก (รวมผู้สมัครใหม่) */
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const branchParam = parseBranchQueryParam(
      new URL(req.url).searchParams.get('branchId') ?? undefined,
    )
    const scope = buildBranchScope(session.user, { branchId: branchParam })
    const employees = await listAttendanceTeamUsers(scope)

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
