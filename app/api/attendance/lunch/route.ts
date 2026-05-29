import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { saveUpload } from '@/lib/save-upload'
import { apiError } from '@/lib/api-handler'
import { assertDeviceAllowed } from '@/lib/device'
import { parseCoord, startOfTodayLocal } from '@/lib/utils'
import { guardAttendanceFace } from '@/lib/face-checkin-guard'
import { finalizeAttendanceRecord } from '@/lib/attendance-work-log'
import { scheduleHrAttendanceLineNotify } from '@/lib/attendance-line-notify'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const deviceCheck = await assertDeviceAllowed(session.user.id, req.headers.get('X-Device-Key'))
    if (!deviceCheck.ok) return NextResponse.json({ error: deviceCheck.error }, { status: 403 })

    const formData = await req.formData()
    const action = formData.get('action') as string

    const faceAction = action === 'lunch-in' ? 'lunch-in' : 'lunch-out'
    const faceBlock = await guardAttendanceFace(session.user.id, formData, faceAction)
    if (faceBlock) return faceBlock
    const photo = formData.get('photo') as File | null
    const lat = parseCoord(formData.get('lat'))
    const lng = parseCoord(formData.get('lng'))
    const address = (formData.get('address') as string) || ''

    if (action !== 'lunch-out' && action !== 'lunch-in') {
      return NextResponse.json({ error: 'action ต้องเป็น lunch-out หรือ lunch-in' }, { status: 400 })
    }
    if (!photo || photo.size === 0) {
      return NextResponse.json({ error: 'ต้องถ่ายรูปหน้าตรงจากกล้อง' }, { status: 400 })
    }

    const photoUrl = await saveUpload(photo, action, session.user.id)
    if (!photoUrl) {
      return NextResponse.json({ error: 'บันทึกรูปไม่สำเร็จ' }, { status: 500 })
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
    const geoPatch =
      lat != null && lng != null
        ? { lat, lng, ...(address ? { address } : {}) }
        : {}

    if (action === 'lunch-out') {
      if (attendance.lunchOut) {
        return NextResponse.json({ error: 'บันทึกเริ่มพักกลางวันแล้ว' }, { status: 400 })
      }
      const updated = await prisma.attendance.update({
        where: { id: attendance.id },
        data: { lunchOut: now, lunchOutPhotoUrl: photoUrl, ...geoPatch },
      })
      const faceLogId = (formData.get('faceLogId') as string) || null
      if (faceLogId) {
        await prisma.attendanceFaceLog
          .update({ where: { id: faceLogId }, data: { attendanceId: updated.id } })
          .catch(() => {})
      }
      const finalized = await finalizeAttendanceRecord(updated.id)
      scheduleHrAttendanceLineNotify({
        event: 'lunch-out',
        employeeUserId: session.user.id,
        attendanceId: finalized.id,
        photoUrl: finalized.lunchOutPhotoUrl,
        eventTime: now,
        location: address || finalized.workPlaceName || null,
      })
      return NextResponse.json({ success: true, attendance: finalized })
    }

    if (!attendance.lunchOut) {
      return NextResponse.json({ error: 'ยังไม่ได้เริ่มพักกลางวัน' }, { status: 400 })
    }
    if (attendance.lunchIn) {
      return NextResponse.json({ error: 'บันทึกกลับจากพักแล้ว' }, { status: 400 })
    }

    const updated = await prisma.attendance.update({
      where: { id: attendance.id },
      data: { lunchIn: now, lunchInPhotoUrl: photoUrl, ...geoPatch },
    })
    const faceLogId = (formData.get('faceLogId') as string) || null
    if (faceLogId) {
      await prisma.attendanceFaceLog
        .update({ where: { id: faceLogId }, data: { attendanceId: updated.id } })
        .catch(() => {})
    }
    const finalized = await finalizeAttendanceRecord(updated.id)
    scheduleHrAttendanceLineNotify({
      event: 'lunch-in',
      employeeUserId: session.user.id,
      attendanceId: finalized.id,
      photoUrl: finalized.lunchInPhotoUrl,
      eventTime: now,
      location: address || finalized.workPlaceName || null,
    })
    return NextResponse.json({ success: true, attendance: finalized })
  } catch (err) {
    return apiError(err)
  }
}
