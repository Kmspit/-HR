import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { assertDeviceAllowed } from '@/lib/device'
import { startOfTodayLocal } from '@/lib/utils'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const deviceKey = req.headers.get('X-Device-Key')
    const deviceCheck = await assertDeviceAllowed(session.user.id, deviceKey)
    if (!deviceCheck.ok) return NextResponse.json({ error: deviceCheck.error }, { status: 403 })

    const { action } = await req.json()
    if (action !== 'lunch-out' && action !== 'lunch-in') {
      return NextResponse.json({ error: 'action ต้องเป็น lunch-out หรือ lunch-in' }, { status: 400 })
    }

    const today = startOfTodayLocal()
    const attendance = await prisma.attendance.findUnique({
      where: { userId_date: { userId: session.user.id, date: today } },
    })

    if (!attendance?.checkIn) {
      return NextResponse.json({ error: 'ต้องเช็คอินก่อน' }, { status: 400 })
    }
    if (attendance.checkOut) {
      return NextResponse.json({ error: 'เช็คเอาท์แล้ว' }, { status: 400 })
    }

    const now = new Date()

    if (action === 'lunch-out') {
      if (attendance.lunchOut) {
        return NextResponse.json({ error: 'บันทึกเริ่มพักกลางวันแล้ว' }, { status: 400 })
      }
      const updated = await prisma.attendance.update({
        where: { id: attendance.id },
        data: { lunchOut: now },
      })
      return NextResponse.json({ success: true, attendance: updated })
    }

    if (!attendance.lunchOut) {
      return NextResponse.json({ error: 'ยังไม่ได้เริ่มพักกลางวัน' }, { status: 400 })
    }
    if (attendance.lunchIn) {
      return NextResponse.json({ error: 'บันทึกกลับจากพักแล้ว' }, { status: 400 })
    }

    const updated = await prisma.attendance.update({
      where: { id: attendance.id },
      data: { lunchIn: now },
    })
    return NextResponse.json({ success: true, attendance: updated })
  } catch (err) {
    return apiError(err)
  }
}
