import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import {
  findLeaveHolidayConflicts,
  formatHolidayConflictMessage,
  loadHolidaysForBranch,
  parseDateOnly,
} from '@/lib/company-holidays'

export async function GET(req: NextRequest) {
  try {    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const startRaw = searchParams.get('startDate')
    const endRaw = searchParams.get('endDate')
    const branchIdParam = searchParams.get('branchId')

    if (!startRaw || !endRaw) {
      return NextResponse.json({ error: 'ต้องระบุ startDate และ endDate' }, { status: 400 })
    }

    const start = parseDateOnly(startRaw)
    const end = parseDateOnly(endRaw)
    if (!start || !end) {
      return NextResponse.json({ error: 'รูปแบบวันที่ไม่ถูกต้อง' }, { status: 400 })
    }
    if (end < start) {
      return NextResponse.json({ error: 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม' }, { status: 400 })
    }

    let branchId = session.user.branchId ?? null
    if (branchIdParam && ['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
      branchId = branchIdParam === 'all' ? null : branchIdParam
    }

    const holidays = await loadHolidaysForBranch(prisma, branchId)
    const conflicts = findLeaveHolidayConflicts(start, end, branchId, holidays)

    return NextResponse.json({
      blocked: conflicts.length > 0,
      conflicts,
      message: formatHolidayConflictMessage(conflicts),
    })
  } catch (err) {
    return apiError(err)
  }
}
