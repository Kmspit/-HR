import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1))
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))
  const userId = searchParams.get('userId') ?? session.user.id

  // Only HR/Manager/Admin can view other users
  if (userId !== session.user.id && !['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0, 23, 59, 59)

  const records = await prisma.attendance.findMany({
    where: { userId, date: { gte: startDate, lte: endDate } },
    orderBy: { date: 'asc' },
  })

  const summary = {
    total: records.length,
    normal: records.filter((r) => r.status === 'NORMAL').length,
    late: records.filter((r) => r.status === 'LATE').length,
    absent: records.filter((r) => r.status === 'ABSENT').length,
    lateMinutes: records.reduce((s, r) => s + (r.lateMinutes ?? 0), 0),
  }

  return NextResponse.json({ records, summary })
}
