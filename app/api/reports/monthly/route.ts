import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { apiError } from '@/lib/api-handler'
import { buildMonthlyReport } from '@/lib/monthly-report'
import { buildBranchScope, resolveFilterBranchId, parseBranchQueryParam } from '@/lib/branch-scope'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id || !['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const month = Number(req.nextUrl.searchParams.get('month') ?? new Date().getMonth() + 1)
    const year = Number(req.nextUrl.searchParams.get('year') ?? new Date().getFullYear())
    const branchParam = parseBranchQueryParam(req.nextUrl.searchParams.get('branchId') ?? undefined)
    const scope = buildBranchScope(session.user, { branchId: branchParam })
    const filterBranchId = resolveFilterBranchId(scope)

    if (!month || !year) {
      return NextResponse.json({ error: 'month and year required' }, { status: 400 })
    }

    const report = await buildMonthlyReport(month, year, filterBranchId)
    return NextResponse.json(report)
  } catch (err) {
    return apiError(err)
  }
}
