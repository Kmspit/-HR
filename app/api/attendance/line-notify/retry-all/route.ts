import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { apiError } from '@/lib/api-handler'
import { retryAllFailedAttendanceLineNotify } from '@/lib/attendance-line-notify'

/** HR/Admin-triggered "retry all now" — unlike the daily cron, this ignores
 *  MAX_CRON_RETRY_COUNT since a human explicitly asked for it. */
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await retryAllFailedAttendanceLineNotify({ limit: 50 })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return apiError(err)
  }
}
