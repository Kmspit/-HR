import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { startOfTodayLocal } from '@/lib/utils'

export async function POST(_req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const now = new Date()
    const today = startOfTodayLocal()

    const attendance = await prisma.attendance.findUnique({
      where: { userId_date: { userId: session.user.id, date: today } },
    })

    if (!attendance?.checkIn) {
      return NextResponse.json({ error: 'ยังไม่ได้เช็คอินวันนี้' }, { status: 400 })
    }
    if (attendance.checkOut) {
      return NextResponse.json({ error: 'เช็คเอาท์แล้ววันนี้' }, { status: 400 })
    }

    const updated = await prisma.attendance.update({
      where: { id: attendance.id },
      data: { checkOut: now },
    })

    return NextResponse.json({ success: true, attendance: updated })
  } catch (err) {
    return apiError(err)
  }
}
