import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { startOfTodayLocal } from '@/lib/utils'
import { getDayOfWeekIndex, finalizeAttendanceRecord } from '@/lib/attendance-work-log'
import { ATTENDANCE_COMPLETED_PATCH } from '@/lib/attendance-flow'
import {
  findActiveAttendanceSession,
  getNextSessionIndex,
} from '@/lib/attendance-session'
import { buildBranchScope, isUserInBranchScope } from '@/lib/branch-scope'
import { HR_ADMIN } from '@/lib/module-gates'
import type { Role } from '@prisma/client'

const ALLOWED_ROLES: Role[] = HR_ADMIN

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!ALLOWED_ROLES.includes(session.user.role as Role)) {
      return NextResponse.json(
        { error: 'เฉพาะ HR หรือ Admin เท่านั้นที่ใช้ override ได้', code: 'FORBIDDEN' },
        { status: 403 },
      )
    }

    const body = (await req.json()) as {
      userId?: string
      action?: string
      reason?: string
    }

    const { userId, action, reason } = body

    if (!userId || !action || !reason?.trim()) {
      return NextResponse.json(
        { error: 'ต้องระบุ userId, action และ reason' },
        { status: 400 },
      )
    }

    const validActions = ['checkin', 'checkout', 'lunch-out', 'lunch-in'] as const
    if (!(validActions as readonly string[]).includes(action)) {
      return NextResponse.json({ error: 'action ไม่ถูกต้อง' }, { status: 400 })
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, employeeId: true, branchId: true },
    })
    if (!targetUser) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้งาน' }, { status: 404 })
    }

    const scope = buildBranchScope(session.user, {})
    const inScope = await isUserInBranchScope(prisma, scope, userId)
    if (!inScope) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const now = new Date()
    const today = startOfTodayLocal()
    const overrideNote = `[HR Override: ${session.user.name ?? session.user.id}] ${reason.trim()}`

    let attendanceId: string

    if (action === 'checkin') {
      const sessionIndex = await getNextSessionIndex(userId, today)
      const created = await prisma.attendance.create({
        data: {
          ...ATTENDANCE_COMPLETED_PATCH,
          userId,
          date: today,
          sessionIndex,
          checkIn: now,
          dayOfWeek: getDayOfWeekIndex(today),
          note: overrideNote,
        },
      })
      const finalized = await finalizeAttendanceRecord(created.id)
      attendanceId = finalized.id
    } else {
      const active = await findActiveAttendanceSession(userId, today)
      if (!active) {
        return NextResponse.json(
          { error: 'ยังไม่ได้เช็คอินวันนี้ — ไม่สามารถ override ได้' },
          { status: 400 },
        )
      }

      const patch =
        action === 'checkout'
          ? { checkOut: now, note: overrideNote }
          : action === 'lunch-out'
            ? { lunchOut: now }
            : { lunchIn: now }

      const updated = await prisma.attendance.update({
        where: { id: active.id },
        data: { ...ATTENDANCE_COMPLETED_PATCH, ...patch },
      })
      const finalized = await finalizeAttendanceRecord(updated.id)
      attendanceId = finalized.id
    }

    // Audit log — ทุก override ต้องมีบันทึก
    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        targetId: userId,
        targetType: 'attendance',
        action: 'UPDATE',
        after: JSON.stringify({
          attendanceId,
          overrideAction: action,
          reason: reason.trim(),
          timestamp: now.toISOString(),
          targetUser: { id: targetUser.id, name: targetUser.name },
        }),
        ip:
          req.headers.get('x-forwarded-for') ??
          req.headers.get('x-real-ip') ??
          undefined,
      },
    })

    return NextResponse.json({
      success: true,
      attendanceId,
      action,
      targetUser: { id: targetUser.id, name: targetUser.name },
    })
  } catch (err) {
    return apiError(err)
  }
}
