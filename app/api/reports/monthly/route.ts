import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { apiError } from '@/lib/api-handler'
import { buildMonthlyReport } from '@/lib/monthly-report'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id || !['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const month = Number(req.nextUrl.searchParams.get('month') ?? new Date().getMonth() + 1)
    const year = Number(req.nextUrl.searchParams.get('year') ?? new Date().getFullYear())
    if (!month || !year) {
      return NextResponse.json({ error: 'month and year required' }, { status: 400 })
    }

    const report = await buildMonthlyReport(month, year)
    return NextResponse.json(report)
  } catch (err) {
    return apiError(err)
  }
}
