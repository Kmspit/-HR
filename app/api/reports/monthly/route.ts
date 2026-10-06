import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { apiError } from '@/lib/api-handler'
import { buildMonthlyReport } from '@/lib/monthly-report'
import { buildBranchScope, resolveFilterBranchId, parseBranchQueryParam } from '@/lib/branch-scope'
import { getCachedUserPagePermissions } from '@/lib/user-page-permissions-cache'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Layered on top of (not replacing) this route's own existing
    // MANAGER_HR/ADMIN-only check — deliberately narrower than /reports
    // page's own ROUTE_PERMISSIONS (MGR_UP), a pre-existing mismatch out of
    // scope here. A per-user override on '/reports' (lib/override-eligible-
    // paths.ts) can still GRANT a specific user in or RESTRICT one of these
    // two roles out, without changing the default for anyone else.
    const overrides = await getCachedUserPagePermissions(session.user.id)
    const override = overrides.find((o) => o.path === '/reports')
    const allowed = override
      ? override.direction === 'GRANT'
      : ['MANAGER_HR', 'ADMIN'].includes(session.user.role)
    if (!allowed) {
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
