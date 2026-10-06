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

    // TODO(pre-existing bug, found 2026-10-02, confirmed still unfixed
    // 2026-10-06 — tracked here, no separate issue tracker in this repo):
    // this route's own default check is MANAGER_HR/ADMIN-only, but the
    // /reports PAGE's own ROUTE_PERMISSIONS is MGR_UP (SUPER_ADMIN, CEO,
    // MANAGER_HR, HR, ADMIN, MANAGER — 6 roles). Repro: log in as SUPER_ADMIN,
    // CEO, HR, or MANAGER — the /reports page itself loads, but this GET
    // 403s and the page shows no data. Likely fix: either widen this route's
    // check to MGR_UP (the probably-intended behavior) or narrow
    // ROUTE_PERMISSIONS['/reports'] to match this route (if MANAGER_HR/ADMIN
    // was actually the intended final policy) — needs a product decision on
    // which list is correct before touching either side. Out of scope for
    // the 2026-10-02 per-user override feature that layered the GRANT/
    // RESTRICT check below on top of this pre-existing behavior unchanged.
    //
    // Layered on top of (not replacing) this route's own existing
    // MANAGER_HR/ADMIN-only check. A per-user override on '/reports' (lib/
    // override-eligible-paths.ts) can still GRANT a specific user in or
    // RESTRICT one of these two roles out, without changing the default for
    // anyone else.
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
