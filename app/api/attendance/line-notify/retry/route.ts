import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { apiError } from '@/lib/api-handler'
import { retryFailedAttendanceLineNotify } from '@/lib/attendance-line-notify'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const logId = (body as { logId?: string }).logId
    if (!logId) {
      return NextResponse.json({ error: 'ต้องระบุ logId' }, { status: 400 })
    }

    const result = await retryFailedAttendanceLineNotify(logId)
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? 'ส่งซ้ำไม่สำเร็จ' }, { status: 502 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
