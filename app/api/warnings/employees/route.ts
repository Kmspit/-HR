import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { WARNING_TARGET_USER_SELECT, WARNING_TARGET_USER_WHERE } from '@/lib/warning-employees'
import { ROLE_LABELS, canApproveWarning, canManageEmployees } from '@/lib/access-control'
import { buildBranchScope, branchUserWhere, parseBranchQueryParam } from '@/lib/branch-scope'
import { requireAuth, isGuardResponse } from '@/lib/api-guard'
import { canListCompanyWideRecords, resolveOrgListScope } from '@/lib/org-scope'
import type { Prisma, Role } from '@prisma/client'

export async function GET(req: Request) {
  try {
    const session = await requireAuth()
    if (isGuardResponse(session)) return session

    const role = session.user.role as Role
    const canListBranch = canListCompanyWideRecords(role) || canManageEmployees(role)
    const canListTeam = canApproveWarning(role) && !canListBranch

    if (!canListBranch && !canListTeam) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const url = new URL(req.url)
    const branchParam = parseBranchQueryParam(url.searchParams.get('branchId') ?? undefined)

    const employees = canListBranch
      ? await prisma.user.findMany({
          where: branchUserWhere(buildBranchScope(session.user, { branchId: branchParam }), WARNING_TARGET_USER_WHERE),
          select: WARNING_TARGET_USER_SELECT,
          orderBy: { name: 'asc' },
        })
      : await (async () => {
          const orgScope = await resolveOrgListScope(prisma, session.user.id, role)
          const where: Prisma.UserWhereInput = { ...WARNING_TARGET_USER_WHERE }
          if (orgScope !== 'ALL') {
            where.id = orgScope.length === 1 ? orgScope[0] : { in: orgScope }
          }
          return prisma.user.findMany({
            where,
            select: WARNING_TARGET_USER_SELECT,
            orderBy: { name: 'asc' },
          })
        })()

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
