import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { ensureDbSchema } from '@/lib/ensure-db-schema'
import { buildMonthlyWorkLog } from '@/lib/attendance-work-log'
import { branchUserWhere, buildBranchScope, parseBranchQueryParam } from '@/lib/branch-scope'

export async function GET(req: NextRequest) {
  try {
    await ensureDbSchema()
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1), 10)
    const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()), 10)
    let userId = searchParams.get('userId') ?? session.user.id
    const branchParam = parseBranchQueryParam(searchParams.get('branchId') ?? undefined)

    if (userId !== session.user.id && !['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (userId !== session.user.id) {
      const scope = buildBranchScope(session.user, { branchId: branchParam })
      const allowed = await prisma.user.findFirst({
        where: branchUserWhere(scope, { id: userId, status: 'ACTIVE' }),
        select: { id: true, name: true, employeeId: true, department: true },
      })
      if (!allowed) {
        return NextResponse.json({ error: 'ไม่พบพนักงานในสาขาที่เลือก' }, { status: 404 })
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, employeeId: true, department: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 })
    }

    const report = await buildMonthlyWorkLog(userId, month, year)

    return NextResponse.json({
      ...report,
      employee: user,
    })
  } catch (err) {
    return apiError(err)
  }
}
