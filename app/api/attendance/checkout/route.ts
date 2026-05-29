import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { saveUpload } from '@/lib/save-upload'
import { apiError } from '@/lib/api-handler'
import { assertDeviceAllowed } from '@/lib/device'
import { parseCoord, startOfTodayLocal } from '@/lib/utils'
import { guardAttendanceFace } from '@/lib/face-checkin-guard'
import { finalizeAttendanceRecord } from '@/lib/attendance-work-log'
import { findApprovedLeaveOnDate } from '@/lib/attendance-leave-sync'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const deviceCheck = await assertDeviceAllowed(session.user.id, req.headers.get('X-Device-Key'))
    if (!deviceCheck.ok) return NextResponse.json({ error: deviceCheck.error }, { status: 403 })

    const formData = await req.formData()

    const faceBlock = await guardAttendanceFace(session.user.id, formData, 'checkout')
    if (faceBlock) return faceBlock

    const photo = formData.get('photo') as File | null
    const lat = parseCoord(formData.get('lat'))
    const lng = parseCoord(formData.get('lng'))
    const address = (formData.get('address') as string) || ''
    const workPlaceName = ((formData.get('workPlaceName') as string) || '').trim() || null

    if (!photo || photo.size === 0) {
      return NextResponse.json({ error: 'ต้องถ่ายรูปหน้าสดจากกล้องตอนเช็คเอาท์' }, { status: 400 })
    }

    const checkOutPhotoUrl = await saveUpload(photo, 'checkout', session.user.id)

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

    const settings = await prisma.companySettings.findUnique({ where: { id: 'singleton' } })
    let earlyLeaveMinutes = 0
    let status = attendance.status
    if (settings?.workEndTime) {
      const [h, m] = settings.workEndTime.split(':').map(Number)
      const workEnd = new Date(now)
      workEnd.setHours(h, m, 0, 0)
      if (now < workEnd) {
        earlyLeaveMinutes = Math.floor((workEnd.getTime() - now.getTime()) / 60000)
        status = 'EARLY_LEAVE'
      }
    }

    const approvedLeave = await findApprovedLeaveOnDate(session.user.id, today)

    const updated = await prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        checkOut: now,
        checkOutPhotoUrl,
        earlyLeaveMinutes,
        status,
        checkOutLat: lat,
        checkOutLng: lng,
        checkOutAddress: address || null,
        checkOutWorkPlaceName: workPlaceName,
        ...(approvedLeave?.type ? { leaveType: approvedLeave.type } : {}),
      },
    })

    const finalized = await finalizeAttendanceRecord(updated.id)

    const faceLogId = (formData.get('faceLogId') as string) || null
    if (faceLogId) {
      await prisma.attendanceFaceLog
        .update({ where: { id: faceLogId }, data: { attendanceId: updated.id } })
        .catch(() => {})
    }

    return NextResponse.json({ success: true, attendance: finalized, earlyLeaveMinutes })
  } catch (err) {
    return apiError(err)
  }
}
