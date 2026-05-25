import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  const attendance = await prisma.attendance.findUnique({
    where: { userId_date: { userId: session.user.id, date: today } },
  })

  if (!attendance?.checkIn) {
    return NextResponse.json({ error: 'เธขเธฑเธเนเธกเนเนเธ”เนเน€เธเนเธเธญเธดเธ' }, { status: 400 })
  }
  if (attendance.checkOut) {
    return NextResponse.json({ error: 'เน€เธเนเธเน€เธญเธฒเธ—เนเนเธฅเนเธงเธงเธฑเธเธเธตเน' }, { status: 400 })
  }

  const updated = await prisma.attendance.update({
    where: { id: attendance.id },
    data: { checkOut: now },
  })

  return NextResponse.json({ success: true, attendance: updated })
}
