import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { buildMonthlyWorkLog } from '@/lib/attendance-work-log'
/** รายงานรายเดือน (legacy) — คืนค่า work log รูปแบบเดียวกับ /api/attendance/work-log */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })  const { searchParams } = new URL(req.url)
  const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1), 10)
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()), 10)
  const userId = searchParams.get('userId') ?? session.user.id

  if (userId !== session.user.id && !['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const report = await buildMonthlyWorkLog(userId, month, year)
  const records = report.rows

  const summary = {
    total: records.length,
    normal: report.summary.present,
    late: report.summary.late,
    absent: report.summary.absent,
    leave: report.summary.leave,
    halfDay: report.summary.halfDay,
    earlyLeave: report.summary.earlyLeave,
    lateMinutes: report.summary.totalLateMinutes,
    workMinutes: report.summary.totalWorkMinutes,
  }

  return NextResponse.json({ records, rows: records, summary })
}
