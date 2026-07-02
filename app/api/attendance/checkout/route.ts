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
import { findApprovedLeaveOnDate } from '@/lib/attendance-leave-sync'
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

    const faceBlock = await guardAttendanceFace(session.user.id, formData, 'checkout')
    if (faceBlock) return faceBlock

    const lat = parseCoord(formData.get('lat'))
    const lng = parseCoord(formData.get('lng'))
    const address = (formData.get('address') as string) || ''
    const workPlaceName = ((formData.get('workPlaceName') as string) || '').trim() || null

    if (!formHasFaceImage(formData)) {
      return NextResponse.json({ error: 'ต้องถ่ายรูปหน้าสดจากกล้องตอนเช็คเอาท์' }, { status: 400 })
    }

    const now = new Date()
    const today = startOfTodayLocal()

    const attendance = await findActiveAttendanceSession(session.user.id, today)

    const flowErr = validateAttendanceFlow(attendance, 'checkout', now)
    if (flowErr) {
      return NextResponse.json(
        { error: attendanceFlowErrorMessage(flowErr), code: flowErr },
        { status: 400 },
      )
    }
    if (!attendance) {
      return NextResponse.json({ error: 'ยังไม่ได้เช็คอินวันนี้' }, { status: 400 })
    }

    const settings = await prisma.companySettings.findUnique({ where: { id: 'singleton' } })
    let earlyLeaveMinutes = 0
    let status = attendance.status
    if (settings?.workEndTime) {
      // สร้าง workEnd ในเวลาไทย (Asia/Bangkok, UTC+7) — ป้องกัน server timezone ผิด
      const dateKey = bangkokDateKey(now)
      const workEnd = new Date(`${dateKey}T${settings.workEndTime}:00+07:00`)
      if (now < workEnd) {
        earlyLeaveMinutes = Math.floor((workEnd.getTime() - now.getTime()) / 60000)
        status = 'EARLY_LEAVE'
      }
    }

    const approvedLeave = await findApprovedLeaveOnDate(session.user.id, today)

    const updated = await prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        ...ATTENDANCE_COMPLETED_PATCH,
        checkOut: now,
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

    const preReadImage = await imageBufferFromForm(formData).catch(() => null)

    after(async () => {
      try {
        const scanResult = await recordFaceScanAndNotifyHr({
          req,
          formData,
          userId: session.user.id,
          scanType: 'checkout',
          attendanceId: finalized.id,
          faceLogId,
          event: 'checkout',
          eventTime: now,
          location: workPlaceName ?? address ?? finalized.workPlaceName ?? null,
          locationName: workPlaceName,
          address: address || null,
          lat,
          lng,
          photoUrl: null,
          earlyLeaveMinutes,
          isOutside: finalized.isOutside,
          preReadImage,
        })
        await syncAttendancePhotoFromFaceScan(finalized.id, scanResult.faceScanId, 'checkOutPhotoUrl')
      } catch (err) {
        console.error('[checkout-bg]', err)
      }
    })

    return NextResponse.json({
      success: true,
      attendance: finalized,
      lateMinutes: finalized.lateMinutes ?? 0,
      lunchOverMinutes: finalized.lunchOverMinutes ?? 0,
      earlyLeaveMinutes,
    })
  } catch (err) {
    return apiError(err)
  }
}
