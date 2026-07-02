import { NextRequest, NextResponse, after } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { requireCsrf } from '@/lib/api-guard'
import { assertDeviceAllowed } from '@/lib/device'
import { parseCoord, startOfTodayLocal } from '@/lib/utils'
import { bangkokDateKey } from '@/lib/datetime-bangkok'
import { guardAttendanceFace } from '@/lib/face-checkin-guard'
import { finalizeAttendanceRecord } from '@/lib/attendance-work-log'
import {
  formHasFaceImage,
  imageBufferFromForm,
  recordFaceScanAndNotifyHr,
  syncAttendancePhotoFromFaceScan,
} from '@/lib/attendance-face-scan'
import {
  ATTENDANCE_COMPLETED_PATCH,
  attendanceFlowErrorMessage,
  validateAttendanceFlow,
} from '@/lib/attendance-flow'
import { findActiveAttendanceSession } from '@/lib/attendance-session'
export async function POST(req: NextRequest) {
  try {
    const csrfErr = requireCsrf(req)
    if (csrfErr) return csrfErr

    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const deviceCheck = await assertDeviceAllowed(session.user.id, req.headers.get('X-Device-Key'))
    if (!deviceCheck.ok) {
      return NextResponse.json({ error: deviceCheck.error, code: deviceCheck.code }, { status: 403 })
    }

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
    const attendance = await findActiveAttendanceSession(session.user.id, today)

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
      const preReadImage = await imageBufferFromForm(formData).catch(() => null)
      after(async () => {
        try {
          const scanResult = await recordFaceScanAndNotifyHr({
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
            isOutside: finalized.isOutside,
            preReadImage,
          })
          await syncAttendancePhotoFromFaceScan(finalized.id, scanResult.faceScanId, 'lunchOutPhotoUrl')
        } catch (err) {
          console.error('[lunch-out-bg]', err)
        }
      })
      return NextResponse.json({ success: true, attendance: finalized })
    }

    const settings = await prisma.companySettings.findUnique({ where: { id: 'singleton' } })
    const lunchReturnTime = settings?.lunchReturnTime ?? '13:00'
    const dateKey = bangkokDateKey(now)
    const lunchReturn = new Date(`${dateKey}T${lunchReturnTime}:00+07:00`)
    const lunchOverMinutes = now > lunchReturn
      ? Math.floor((now.getTime() - lunchReturn.getTime()) / 60000)
      : 0

    const updated = await prisma.attendance.update({
      where: { id: attendance.id },
      data: { ...ATTENDANCE_COMPLETED_PATCH, lunchIn: now, lunchOverMinutes, ...geoPatch },
    })
    const faceLogId = (formData.get('faceLogId') as string) || null
    if (faceLogId) {
      await prisma.attendanceFaceLog
        .update({ where: { id: faceLogId }, data: { attendanceId: updated.id } })
        .catch(() => {})
    }
    const finalized = await finalizeAttendanceRecord(updated.id)
    const preReadImage = await imageBufferFromForm(formData).catch(() => null)
    after(async () => {
      try {
        const scanResult = await recordFaceScanAndNotifyHr({
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
          isOutside: finalized.isOutside,
          preReadImage,
        })
        await syncAttendancePhotoFromFaceScan(finalized.id, scanResult.faceScanId, 'lunchInPhotoUrl')
      } catch (err) {
        console.error('[lunch-in-bg]', err)
      }
    })
    return NextResponse.json({ success: true, attendance: finalized, lunchOverMinutes })
  } catch (err) {
    return apiError(err)
  }
}
