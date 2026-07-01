import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { WARNING_TARGET_USER_SELECT, WARNING_TARGET_USER_WHERE } from '@/lib/warning-employees'
import { ROLE_LABELS } from '@/lib/access-control'
import { buildBranchScope, branchUserWhere, parseBranchQueryParam } from '@/lib/branch-scope'
import { requirePermission, isGuardResponse } from '@/lib/api-guard'

export async function GET(req: Request) {
  try {
    const session = await requirePermission('view_all_dashboard')
    if (isGuardResponse(session)) return session

    const url = new URL(req.url)
    const branchParam = parseBranchQueryParam(url.searchParams.get('branchId') ?? undefined)
    const scope = buildBranchScope(session.user, { branchId: branchParam })

    const employees = await prisma.user.findMany({
      where: branchUserWhere(scope, WARNING_TARGET_USER_WHERE),
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
