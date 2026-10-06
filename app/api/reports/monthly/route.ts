import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { apiError } from '@/lib/api-handler'
import { buildMonthlyReport } from '@/lib/monthly-report'
import { buildBranchScope, resolveFilterBranchId, parseBranchQueryParam } from '@/lib/branch-scope'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // TODO(pre-existing bug, found 2026-10-02, confirmed still unfixed
    // 2026-10-09 — tracked here, no separate issue tracker in this repo):
    // this route's own default check is MANAGER_HR/ADMIN-only, but the
    // /reports PAGE's own ROUTE_PERMISSIONS is MGR_UP (SUPER_ADMIN, CEO,
    // MANAGER_HR, HR, ADMIN, MANAGER — 6 roles). Repro: log in as SUPER_ADMIN,
    // CEO, HR, or MANAGER — the /reports page itself loads, but this GET
    // 403s and the page shows no data.
    //
    // !!! DO NOT "FIX" THIS BY JUST WIDENING THE CHECK BELOW TO MGR_UP !!!
    // buildMonthlyReport() (lib/monthly-report.ts) returns baseSalary for
    // every matched employee with NO further per-viewer filtering beyond
    // `filterBranchId` — and resolveFilterBranchId() (lib/branch-scope.ts)
    // currently treats any role that isn't EMPLOYEE/LAWYER as "see every
    // branch" when no explicit branchId is passed (which MANAGER, having no
    // branch-picker UI, never does). Naively widening this route's role
    // check to match MGR_UP would let a plain MANAGER see every employee's
    // salary company-wide, not just their own branch — this was confirmed
    // during the 2026-10-09 review as the EXACT reason /payroll and /reports
    // were pulled from the per-user override feature in the first place
    // (see lib/override-eligible-paths.ts). A real fix needs
    // resolveFilterBranchId() to fail-closed FIRST (own TODO in branch-
    // scope.ts), re-verified against this route specifically, before this
    // role-check mismatch can be safely closed either direction.
    //
    // (The override-aware overlay this comment used to describe here was
    // removed 2026-10-09 along with '/reports' from OVERRIDE_ELIGIBLE_PATHS
    // — this route is plain role-only again until /reports is re-added.)
    const allowed = ['MANAGER_HR', 'ADMIN'].includes(session.user.role)
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
