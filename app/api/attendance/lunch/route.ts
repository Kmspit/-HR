import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { assertDeviceAllowed } from '@/lib/device'
import { parseCoord, startOfTodayLocal } from '@/lib/utils'
import { guardAttendanceFace } from '@/lib/face-checkin-guard'
import { finalizeAttendanceRecord } from '@/lib/attendance-work-log'
import {
  formHasFaceImage,
  recordFaceScanAndNotifyHr,
  syncAttendancePhotoFromFaceScan,
} from '@/lib/attendance-face-scan'
import {
  ATTENDANCE_COMPLETED_PATCH,
  attendanceFlowErrorMessage,
  validateAttendanceFlow,
} from '@/lib/attendance-flow'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await assertDeviceAllowed(session.user.id, req.headers.get('X-Device-Key'))

    const formData = await req.formData()
    const action = formData.get('action') as string

    const faceAction = action === 'lunch-in' ? 'lunch-in' : 'lunch-out'
    const faceBlock = await guardAttendanceFace(session.user.id, formData, faceAction)
    if (faceBlock) return faceBlock

    const lat = parseCoord(formData.get('lat'))
    const lng = parseCoord(formData.get('lng'))
    const address = (formData.get('address') as string) || ''

    if (action !== 'lunch-out' && action !== 'lunch-in') {
      return NextResponse.json({ error: 'action ต้องเป็น lunch-out หรือ lunch-in' }, { status: 400 })
    }
    if (!formHasFaceImage(formData)) {
      return NextResponse.json({ error: 'ต้องถ่ายรูปหน้าตรงจากกล้อง' }, { status: 400 })
    }

    const today = startOfTodayLocal()
    const attendance = await prisma.attendance.findUnique({
      where: { userId_date: { userId: session.user.id, date: today } },
    })

    const now = new Date()
    const flowAction = action === 'lunch-in' ? 'lunch-in' : 'lunch-out'
    const flowErr = validateAttendanceFlow(attendance, flowAction, now)
    if (flowErr) {
      return NextResponse.json(
        { error: attendanceFlowErrorMessage(flowErr), code: flowErr },
        { status: 400 },
      )
    }
    if (!attendance) {
      return NextResponse.json({ error: 'ต้องเช็คอินก่อน' }, { status: 400 })
    }
    const geoPatch =
      lat != null && lng != null
        ? { lat, lng, ...(address ? { address } : {}) }
        : {}

    if (action === 'lunch-out') {
      const updated = await prisma.attendance.update({
        where: { id: attendance.id },
        data: { ...ATTENDANCE_COMPLETED_PATCH, lunchOut: now, ...geoPatch },
      })
      const faceLogId = (formData.get('faceLogId') as string) || null
      if (faceLogId) {
        await prisma.attendanceFaceLog
          .update({ where: { id: faceLogId }, data: { attendanceId: updated.id } })
          .catch(() => {})
      }
      const finalized = await finalizeAttendanceRecord(updated.id)
      try {
        const faceScanId = await recordFaceScanAndNotifyHr({
          req,
          formData,
          userId: session.user.id,
          scanType: 'lunch-out',
          attendanceId: finalized.id,
          faceLogId,
          event: 'lunch-out',
          eventTime: now,
          location: address || finalized.workPlaceName || null,
          address: address || null,
          lat,
          lng,
          photoUrl: null,
        })
        await syncAttendancePhotoFromFaceScan(finalized.id, faceScanId, 'lunchOutPhotoUrl')
      } catch (err) {
        console.error('[lunch-out-face-line]', err)
      }
      return NextResponse.json({ success: true, attendance: finalized })
    }

    const updated = await prisma.attendance.update({
      where: { id: attendance.id },
      data: { ...ATTENDANCE_COMPLETED_PATCH, lunchIn: now, ...geoPatch },
    })
    const faceLogId = (formData.get('faceLogId') as string) || null
    if (faceLogId) {
      await prisma.attendanceFaceLog
        .update({ where: { id: faceLogId }, data: { attendanceId: updated.id } })
        .catch(() => {})
    }
    const finalized = await finalizeAttendanceRecord(updated.id)
    try {
      const faceScanId = await recordFaceScanAndNotifyHr({
        req,
        formData,
        userId: session.user.id,
        scanType: 'lunch-in',
        attendanceId: finalized.id,
        faceLogId,
        event: 'lunch-in',
        eventTime: now,
        location: address || finalized.workPlaceName || null,
        address: address || null,
        lat,
        lng,
        photoUrl: null,
      })
      await syncAttendancePhotoFromFaceScan(finalized.id, faceScanId, 'lunchInPhotoUrl')
    } catch (err) {
      console.error('[lunch-in-face-line]', err)
    }
    return NextResponse.json({ success: true, attendance: finalized })
  } catch (err) {
    return apiError(err)
  }
}
