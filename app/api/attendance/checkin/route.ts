import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { saveUpload } from '@/lib/save-upload'
import { apiError } from '@/lib/api-handler'
import { assertDeviceAllowed } from '@/lib/device'
import { parseCoord, startOfTodayLocal } from '@/lib/utils'
import { guardAttendanceFace } from '@/lib/face-checkin-guard'
import { finalizeAttendanceRecord, getDayOfWeekIndex } from '@/lib/attendance-work-log'
import { findApprovedLeaveOnDate } from '@/lib/attendance-leave-sync'

function getDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const deviceCheck = await assertDeviceAllowed(session.user.id, req.headers.get('X-Device-Key'))
    if (!deviceCheck.ok) return NextResponse.json({ error: deviceCheck.error }, { status: 403 })

    const formData = await req.formData()

    const faceBlock = await guardAttendanceFace(session.user.id, formData, 'checkin')
    if (faceBlock) return faceBlock

    const lat = parseCoord(formData.get('lat'))
    const lng = parseCoord(formData.get('lng'))
    const address = (formData.get('address') as string) || ''
    const photo = formData.get('photo') as File | null
    const locationType = (formData.get('locationType') as string) ?? 'company'
    const workPlaceName = ((formData.get('workPlaceName') as string) || '').trim() || null
    const forceOutside = locationType === 'outside'

    if (!photo || photo.size === 0) {
      return NextResponse.json({ error: 'ต้องถ่ายรูปหน้าสดจากกล้อง' }, { status: 400 })
    }

    const photoUrl = photo && photo.size > 0
      ? await saveUpload(photo, 'checkin', session.user.id)
      : undefined

    let settings = await prisma.companySettings.findUnique({ where: { id: 'singleton' } })
    if (!settings) {
      settings = await prisma.companySettings.create({ data: { id: 'singleton' } })
    }
    let isOutside = forceOutside
    if (!forceOutside && settings.geofenceLat != null && settings.geofenceLng != null && lat != null && lng != null) {
      const dist = getDistanceMeters(lat, lng, settings.geofenceLat, settings.geofenceLng)
      isOutside = dist > (settings.geofenceRadius ?? 200)
    }

    const now = new Date()
    let lateMinutes = 0
    let status: 'NORMAL' | 'LATE' = 'NORMAL'
    if (settings?.workStartTime) {
      const [h, m] = settings.workStartTime.split(':').map(Number)
      const grace = settings.lateGraceMin ?? 15
      const workStart = new Date(now)
      workStart.setHours(h, m + grace, 0, 0)
      if (now > workStart) {
        lateMinutes = Math.floor((now.getTime() - workStart.getTime()) / 60000)
        status = 'LATE'
      }
    }

    const today = startOfTodayLocal()

    const existing = await prisma.attendance.findUnique({
      where: { userId_date: { userId: session.user.id, date: today } },
    })

    if (existing?.checkIn) {
      return NextResponse.json({ error: 'เช็คอินแล้ววันนี้' }, { status: 400 })
    }

    const approvedLeave = await findApprovedLeaveOnDate(session.user.id, today)
    const leaveType = approvedLeave?.type ?? undefined

    const attendance = await prisma.attendance.upsert({
      where: { userId_date: { userId: session.user.id, date: today } },
      update: {
        checkIn: now,
        lat,
        lng,
        address,
        workPlaceName,
        checkInLat: lat,
        checkInLng: lng,
        checkInAddress: address || null,
        checkInWorkPlaceName: workPlaceName,
        photoUrl,
        isOutside,
        status,
        lateMinutes,
        dayOfWeek: getDayOfWeekIndex(today),
        ...(leaveType ? { leaveType } : {}),
      },
      create: {
        userId: session.user.id,
        date: today,
        checkIn: now,
        lat,
        lng,
        address,
        workPlaceName,
        checkInLat: lat,
        checkInLng: lng,
        checkInAddress: address || null,
        checkInWorkPlaceName: workPlaceName,
        photoUrl,
        isOutside,
        status,
        lateMinutes,
        dayOfWeek: getDayOfWeekIndex(today),
        leaveType: leaveType ?? null,
      },
    })

    const finalized = await finalizeAttendanceRecord(attendance.id)

    const faceLogId = (formData.get('faceLogId') as string) || null
    if (faceLogId) {
      await prisma.attendanceFaceLog
        .update({ where: { id: faceLogId }, data: { attendanceId: finalized.id } })
        .catch(() => {})
    }

    return NextResponse.json({ success: true, attendance: finalized, isOutside, lateMinutes })
  } catch (err) {
    return apiError(err)
  }
}
