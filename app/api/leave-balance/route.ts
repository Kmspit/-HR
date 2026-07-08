import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { canManageUsers } from '@/lib/access-control'
import { buildBranchScope, branchUserWhere } from '@/lib/branch-scope'
import { getLeaveBalanceStats, ensureLeaveBalance, getLeaveUsedByYear } from '@/lib/leave-balance'
import { createAuditLog } from '@/lib/notifications'
import type { Role } from '@prisma/client'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))
    const targetUserId = searchParams.get('userId') ?? session.user.id

    // Only HR/Admin can view other users' balance
    if (targetUserId !== session.user.id && !canManageUsers(session.user.role as Role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (targetUserId !== session.user.id && canManageUsers(session.user.role as Role)) {
      const scope = buildBranchScope(session.user, {})
      const inScope = await prisma.user.findFirst({
        where: branchUserWhere(scope, { id: targetUserId }),
        select: { id: true },
      })
      if (!inScope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // HR requesting all users
    if (searchParams.get('all') === '1' && canManageUsers(session.user.role as Role)) {
      const scope = buildBranchScope(session.user, {})
      const users = await prisma.user.findMany({
        where: branchUserWhere(scope, { status: 'ACTIVE' }),
        select: { id: true, name: true, role: true, department: true, position: true, startDate: true },
        orderBy: { name: 'asc' },
      })

      const results = await Promise.all(
        users.map(async (u) => {
          const balance = await ensureLeaveBalance(u.id, year)
          const used = await getLeaveUsedByYear(u.id, year)
          return {
            userId: u.id,
            name: u.name,
            role: u.role,
            department: u.department,
            position: u.position,
            startDate: u.startDate,
            balance: { sick: balance.sick, vacation: balance.vacation, personal: balance.personal },
            used: { sick: used.SICK, vacation: used.VACATION, personal: used.PERSONAL, ordination: used.ORDINATION },
            remaining: {
              sick:     Math.max(0, balance.sick     - used.SICK),
              vacation: Math.max(0, balance.vacation - used.VACATION),
              personal: Math.max(0, balance.personal - used.PERSONAL),
            },
          }
        }),
      )

      return NextResponse.json({ year, users: results })
    }

    const stats = await getLeaveBalanceStats(targetUserId, year)
    return NextResponse.json({ year, ...stats })
  } catch (err) {
    return apiError(err)
  }
}

/** HR: update leave balance for a specific user */
export async function PUT(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canManageUsers(session.user.role as Role)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const body = (await req.json()) as {
      userId: string
      year?: number
      sick?: number
      vacation?: number
      personal?: number
      unpaid?: number
    }

    if (!body.userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

    const scope = buildBranchScope(session.user, {})
    const inScope = await prisma.user.findFirst({
      where: branchUserWhere(scope, { id: body.userId }),
      select: { id: true },
    })
    if (!inScope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const year = body.year ?? new Date().getFullYear()
    const ip = req.headers.get('x-forwarded-for') ?? 'unknown'

    const existing = await prisma.leaveBalance.findUnique({
      where: { userId_year: { userId: body.userId, year } },
    })

    const updateData: Record<string, number> = {}
    if (body.sick     !== undefined) updateData.sick     = Math.max(0, body.sick)
    if (body.vacation !== undefined) updateData.vacation = Math.max(0, body.vacation)
    if (body.personal !== undefined) updateData.personal = Math.max(0, body.personal)
    if (body.unpaid   !== undefined) updateData.unpaid   = Math.max(0, body.unpaid)

    let updated
    if (existing) {
      updated = await prisma.leaveBalance.update({
        where: { userId_year: { userId: body.userId, year } },
        data: updateData,
      })
    } else {
      updated = await prisma.leaveBalance.create({
        data: { userId: body.userId, year, sick: 30, vacation: 6, personal: 3, unpaid: 0, ...updateData },
      })
    }

    await createAuditLog({
      actorId:    session.user.id,
      targetId:   body.userId,
      targetType: 'LeaveBalance',
      action:     'UPDATE',
      before:     existing ? { sick: existing.sick, vacation: existing.vacation, personal: existing.personal } : undefined,
      after:      { sick: updated.sick, vacation: updated.vacation, personal: updated.personal, year },
      ip,
    })

    return NextResponse.json({ success: true, balance: updated })
  } catch (err) {
    return apiError(err)
  }
}
