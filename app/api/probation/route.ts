import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { buildBranchScope, branchUserWhere, isUserInBranchScope } from '@/lib/branch-scope'
import { HR_ROLES } from '@/lib/access-control'
import { canApproverActOnRequester } from '@/lib/org-scope'
import { requireCsrf } from '@/lib/api-guard'
import type { Role } from '@prisma/client'

function isProbationComplete(startDate: Date | null, probationMonths: number): boolean {
  if (!startDate) return false
  const cutoff = new Date(startDate)
  cutoff.setMonth(cutoff.getMonth() + probationMonths)
  return new Date() >= cutoff
}

function probationEndDate(startDate: Date, probationMonths: number): Date {
  const d = new Date(startDate)
  d.setMonth(d.getMonth() + probationMonths)
  return d
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const isHr = (HR_ROLES as readonly string[]).includes(session.user.role)
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')

    const settings = await prisma.companySettings.findUnique({
      where: { id: 'singleton' },
      select: { probationMonths: true },
    })
    const probationMonths = (settings as unknown as { probationMonths?: number })?.probationMonths ?? 3

    if (!isHr) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, name: true, startDate: true },
      })
      if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      const eval_ = await prisma.probationEvaluation.findUnique({
        where: { userId: session.user.id },
      })
      return NextResponse.json({
        probationMonths,
        employee: {
          ...user,
          probationComplete: isProbationComplete(user.startDate, probationMonths),
          probationEndDate: user.startDate
            ? probationEndDate(user.startDate, probationMonths).toISOString()
            : null,
          evaluation: eval_,
        },
      })
    }

    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, employeeId: true, department: true, position: true, startDate: true },
      })
      if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      if (session.user.role === 'MANAGER') {
        const inTeam = await canApproverActOnRequester(
          prisma,
          session.user.id,
          session.user.role as Role,
          userId,
        )
        if (!inTeam) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      } else {
        const scope = buildBranchScope(session.user, {})
        const inBranch = await isUserInBranchScope(prisma, scope, userId)
        if (!inBranch) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const eval_ = await prisma.probationEvaluation.findUnique({ where: { userId } })
      return NextResponse.json({
        probationMonths,
        employee: {
          ...user,
          probationComplete: isProbationComplete(user.startDate, probationMonths),
          probationEndDate: user.startDate
            ? probationEndDate(user.startDate, probationMonths).toISOString()
            : null,
          evaluation: eval_,
        },
      })
    }

    // HR: list all employees who have reached probation end date but no evaluation
    const scope = buildBranchScope(session.user, {})
    const employees = await prisma.user.findMany({
      where: branchUserWhere(scope, { status: 'ACTIVE', startDate: { not: null } }),
      select: {
        id: true,
        name: true,
        employeeId: true,
        department: true,
        position: true,
        startDate: true,
        probationEvaluation: true,
      },
      orderBy: { startDate: 'asc' },
    })

    const result = employees
      .filter((e) => e.startDate)
      .map((e) => ({
        id: e.id,
        name: e.name,
        employeeId: e.employeeId,
        department: e.department,
        position: e.position,
        startDate: e.startDate!.toISOString(),
        probationComplete: isProbationComplete(e.startDate, probationMonths),
        probationEndDate: probationEndDate(e.startDate!, probationMonths).toISOString(),
        evaluation: e.probationEvaluation,
      }))

    return NextResponse.json({ employees: result, probationMonths })
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const csrfErr = requireCsrf(req)
    if (csrfErr) return csrfErr

    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { userId, result, notes } = await req.json()
    if (!userId || !['PASSED', 'FAILED'].includes(result)) {
      return NextResponse.json({ error: 'userId และ result (PASSED/FAILED) จำเป็น' }, { status: 400 })
    }

    const role = session.user.role as Role
    const isHr = (HR_ROLES as readonly string[]).includes(role)
    if (role === 'MANAGER') {
      const inTeam = await canApproverActOnRequester(prisma, session.user.id, role, userId)
      if (!inTeam) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    } else if (!isHr) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    } else {
      const scope = buildBranchScope(session.user, {})
      const inBranch = await isUserInBranchScope(prisma, scope, userId)
      if (!inBranch) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const evaluation = await prisma.probationEvaluation.upsert({
      where: { userId },
      create: {
        userId,
        result,
        notes: notes ?? null,
        evaluatedById: session.user.id,
        evaluatedAt: new Date(),
      },
      update: {
        result,
        notes: notes ?? null,
        evaluatedById: session.user.id,
        evaluatedAt: new Date(),
      },
    })

    return NextResponse.json({ evaluation })
  } catch (err) {
    return apiError(err)
  }
}
