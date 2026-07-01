import { NextRequest, NextResponse, after } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { assertDeviceAllowed } from '@/lib/device'
import { parseCoord, startOfTodayLocal } from '@/lib/utils'
import { bangkokDateKey } from '@/lib/datetime-bangkok'
import { guardAttendanceFace } from '@/lib/face-checkin-guard'
import { finalizeAttendanceRecord, getDayOfWeekIndex } from '@/lib/attendance-work-log'
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
import {
  findActiveAttendanceSession,
  getNextSessionIndex,
  hasCheckInToday,
} from '@/lib/attendance-session'
import { ensureDbSchema } from '@/lib/ensure-db-schema'
import { haversineDistanceMeters, detectGpsSpoofFlags } from '@/lib/gps-fence'
import { findApprovedOutsideWorkForDate, OUTSIDE_WORK_LATE_TIME } from '@/lib/outside-work'
import { findApprovedWeeklyPlanDayForDate, WEEKLY_PLAN_LOCATION_TOLERANCE_METERS } from '@/lib/weekly-plan-attendance'
import type { ApprovedPlanDay } from '@/lib/weekly-plan-attendance'

export async function POST(req: NextRequest) {
  try {
    await ensureDbSchema().catch(() => {})
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await assertDeviceAllowed(session.user.id, req.headers.get('X-Device-Key'))

    const formData = await req.formData()

    const faceBlock = await guardAttendanceFace(session.user.id, formData, 'checkin')
    if (faceBlock) return faceBlock

    const lat = parseCoord(formData.get('lat'))
    const lng = parseCoord(formData.get('lng'))
    const address = (formData.get('address') as string) || ''
    const locationType = (formData.get('locationType') as string) ?? 'company'
    const workPlaceName = ((formData.get('workPlaceName') as string) || '').trim() || null
    const forceOutside = locationType === 'outside'
    const gpsAccuracy = parseFloat((formData.get('gpsAccuracy') as string) ?? '') || null
    const deviceInfoRaw = (formData.get('deviceInfo') as string) || null
    const deviceInfo = deviceInfoRaw ? deviceInfoRaw.slice(0, 500) : null

    // Extract device info from User-Agent header as authoritative source
    const ua = req.headers.get('user-agent') ?? ''
    const serverDeviceInfo = deviceInfo ?? JSON.stringify({ ua: ua.slice(0, 300) })

    if (!formHasFaceImage(formData)) {
      return NextResponse.json({ error: 'ต้องถ่ายรูปหน้าสดจากกล้อง' }, { status: 400 })
    }

    const today = startOfTodayLocal()
    const now = new Date()

    let settings = await prisma.companySettings.findUnique({ where: { id: 'singleton' } })
    if (!settings) {
      settings = await prisma.companySettings.create({ data: { id: 'singleton', lateGraceMin: 5 } })
    } else if (settings.lateGraceMin === 15) {
      // Migrate old unused default (15) to correct grace period (5 min = 08:35 threshold)
      settings = await prisma.companySettings.update({ where: { id: 'singleton' }, data: { lateGraceMin: 5 } })
    }

    // โหลด branch ของ user สำหรับ geofence แบบ per-branch
    const userBranch = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        branchId: true,
        branch: { select: { id: true, lat: true, lng: true, radiusMeters: true, name: true } },
      },
    })
    const branchId: string | null = userBranch?.branchId ?? null

    // เลือก geofence:
    // - ถ้า user มี branch → ใช้ coords ของ branch เท่านั้น (ไม่ fallback ไป CompanySettings)
    //   ถ้า branch ยังไม่ตั้ง coords → ข้าม geofence (ดีกว่า fallback ไปพิกัดเก่าที่อาจผิด)
    // - ถ้า user ไม่มี branch → ใช้ CompanySettings (backward compat)
    let geofenceLat: number | null
    let geofenceLng: number | null
    let geofenceRadius: number
    let geofenceName: string
    if (userBranch?.branchId && userBranch?.branch) {
      geofenceLat = userBranch.branch.lat
      geofenceLng = userBranch.branch.lng
      geofenceRadius = userBranch.branch.radiusMeters
      geofenceName = userBranch.branch.name
    } else {
      geofenceLat = settings.geofenceLat
      geofenceLng = settings.geofenceLng
      geofenceRadius = settings.geofenceRadius ?? 200
      geofenceName = 'สำนักงาน'
    }
    const hasGeofence = geofenceLat != null && geofenceLng != null

    let isOutside = forceOutside
    let checkInDistanceM: number | null = null
    let gpsFlags: string | null = null

    if (!forceOutside && hasGeofence) {
      if (lat == null || lng == null) {
        return NextResponse.json(
          { error: 'กรุณาเปิด GPS ก่อนเช็คอินในบริษัท', code: 'GPS_REQUIRED' },
          { status: 400 },
        )
      }
      const distanceM = haversineDistanceMeters(lat, lng, geofenceLat!, geofenceLng!)
      checkInDistanceM = distanceM
      isOutside = distanceM > geofenceRadius

      // GPS spoof detection — flags stored for HR review, does NOT block check-in
      const spoofFlagList = detectGpsSpoofFlags({ lat, lng, accuracy: gpsAccuracy, distanceM })
      if (spoofFlagList.length > 0) gpsFlags = spoofFlagList.join(',')

      // Enforce geofence: บล็อกถ้าอยู่นอกรัศมีสาขาของตนเอง
      if (isOutside) {
        return NextResponse.json(
          {
            error: `คุณอยู่นอกพื้นที่บริษัท — ห่าง ${Math.round(distanceM)} เมตร จาก${geofenceName} (รัศมีที่อนุญาต ${Math.round(geofenceRadius)} เมตร)`,
            distanceM: Math.round(distanceM),
            radiusM: Math.round(geofenceRadius),
            branchName: geofenceName,
            code: 'OUTSIDE_GEOFENCE',
          },
          { status: 403 },
        )
      }
    } else if (forceOutside && hasGeofence && lat != null && lng != null) {
      checkInDistanceM = haversineDistanceMeters(lat, lng, geofenceLat!, geofenceLng!)
    }

    // Outside work: ตรวจสอบใบอนุมัติออกนอกสถานที่สำหรับวันนี้
    let approvedOutsideWork = null
    let outsideWorkRequestId: string | null = null
    let approvedPlanDay: ApprovedPlanDay | null = null
    let weeklyPlanDayId: string | null = null
    let plannedLat: number | null = null
    let plannedLng: number | null = null
    let plannedPlace: string | null = null
    let locationDistance: number | null = null
    let locationStatus: string | null = null

    if (forceOutside) {
      approvedOutsideWork = await findApprovedOutsideWorkForDate(session.user.id, today)
      outsideWorkRequestId = approvedOutsideWork?.id ?? null

      // Check approved weekly plan day for today (additional permission pathway)
      approvedPlanDay = await findApprovedWeeklyPlanDayForDate(session.user.id, today)

      // ถ้า geofence ตั้งค่าไว้ → ต้องมีใบอนุมัติ (OutsideWorkRequest หรือ WeeklyPlanDay)
      if (!outsideWorkRequestId && !approvedPlanDay && hasGeofence) {
        return NextResponse.json(
          {
            error: 'ต้องมีใบอนุมัติออกนอกสถานที่สำหรับวันนี้จึงเช็คอินนอกบริษัทได้',
            code: 'OUTSIDE_WORK_NOT_APPROVED',
          },
          { status: 403 },
        )
      }

      // GPS location validation against weekly plan day
      if (approvedPlanDay) {
        weeklyPlanDayId = approvedPlanDay.id
        plannedPlace = approvedPlanDay.place

        if (approvedPlanDay.lat != null && approvedPlanDay.lng != null && lat != null && lng != null) {
          plannedLat = approvedPlanDay.lat
          plannedLng = approvedPlanDay.lng
          locationDistance = haversineDistanceMeters(lat, lng, plannedLat, plannedLng)
          locationStatus = locationDistance > WEEKLY_PLAN_LOCATION_TOLERANCE_METERS ? 'mismatch' : 'matched'
        } else {
          locationStatus = 'no_gps_plan'
        }
      } else if (outsideWorkRequestId) {
        locationStatus = 'no_plan'
      }
    }

    const dateKey = bangkokDateKey(now)
    let lateMinutes = 0
    let status: 'NORMAL' | 'LATE' = 'NORMAL'

    if (forceOutside && outsideWorkRequestId) {
      // งานนอกสถานที่: สายหลัง 09:00
      const outsideDeadline = new Date(`${dateKey}T${OUTSIDE_WORK_LATE_TIME}:00+07:00`)
      if (now > outsideDeadline) {
        lateMinutes = Math.floor((now.getTime() - outsideDeadline.getTime()) / 60000)
        status = 'LATE'
      }
    } else if (!forceOutside && settings?.workStartTime) {
      // เช็คอินในบริษัท: สายหลัง workStartTime + grace period (เช่น 08:30 + 5 น. = 08:35)
      const graceMin = settings.lateGraceMin ?? 5
      const baseDeadline = new Date(`${dateKey}T${settings.workStartTime}:00+07:00`)
      const effectiveDeadline = new Date(baseDeadline.getTime() + graceMin * 60_000)
      if (now > effectiveDeadline) {
        lateMinutes = Math.floor((now.getTime() - effectiveDeadline.getTime()) / 60000)
        status = 'LATE'
      }
    }

    if (await hasCheckInToday(session.user.id, today)) {
      return NextResponse.json(
        { error: attendanceFlowErrorMessage('ALREADY_CHECKIN_TODAY'), code: 'ALREADY_CHECKIN_TODAY' },
        { status: 400 },
      )
    }

    const activeSession = await findActiveAttendanceSession(session.user.id, today)

    const flowErr = validateAttendanceFlow(activeSession, 'checkin', now)
    if (flowErr) {
      return NextResponse.json(
        { error: attendanceFlowErrorMessage(flowErr), code: flowErr },
        { status: 400 },
      )
    }

    const sessionIndex = await getNextSessionIndex(session.user.id, today)
    const isFirstSessionOfDay = sessionIndex === 1

    const approvedLeave = await findApprovedLeaveOnDate(session.user.id, today)
    const leaveType = approvedLeave?.type ?? undefined

    const attendance = await prisma.attendance.create({
      data: {
        ...ATTENDANCE_COMPLETED_PATCH,
        userId: session.user.id,
        date: today,
        sessionIndex,
        checkIn: now,
        lat,
        lng,
        address,
        workPlaceName,
        checkInLat: lat,
        checkInLng: lng,
        checkInAddress: address || null,
        checkInWorkPlaceName: workPlaceName,
        isOutside,
        checkInDistanceM,
        gpsAccuracy,
        gpsFlags,
        deviceInfo: serverDeviceInfo,
        outsideWorkRequestId,
        weeklyPlanDayId,
        plannedLat,
        plannedLng,
        plannedPlace,
        locationDistance,
        locationStatus,
        branchId,
        status: isFirstSessionOfDay ? status : 'NORMAL',
        lateMinutes: isFirstSessionOfDay ? lateMinutes : 0,
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

    // Pre-read image buffer BEFORE after() — formData File may expire post-response
    const preReadImage = await imageBufferFromForm(formData).catch(() => null)

    // Run Cloudinary upload + LINE notification AFTER response is sent (non-blocking)
    after(async () => {
      try {
        const scanResult = await recordFaceScanAndNotifyHr({
          req,
          formData,
          userId: session.user.id,
          scanType: 'checkin',
          attendanceId: finalized.id,
          faceLogId,
          event: 'checkin',
          eventTime: now,
          location: workPlaceName ?? address ?? null,
          locationName: workPlaceName,
          address: address || null,
          lat,
          lng,
          photoUrl: null,
          lateMinutes,
          isOutside,
          preReadImage,
        })
        await syncAttendancePhotoFromFaceScan(finalized.id, scanResult.faceScanId, 'photoUrl')
      } catch (err) {
        console.error('[checkin-bg]', err)
      }
    })

    // GPS mismatch: notify supervisor + CEO after response
    if (locationStatus === 'mismatch' && locationDistance != null) {
      const employeeName = session.user.name ?? 'พนักงาน'
      const distM = Math.round(locationDistance)
      const mismatchMsg = `${employeeName} เช็คอินนอกสถานที่ — GPS ห่างจากแผนงาน ${distM} เมตร (ได้รับอนุญาต ${WEEKLY_PLAN_LOCATION_TOLERANCE_METERS} ม.) | สถานที่วางแผน: ${plannedPlace ?? '—'}`
      after(async () => {
        try {
          const { notifyRole: _notifyRole } = await import('@/lib/notifications')
          await _notifyRole('MANAGER_HR', 'SYSTEM', '⚠️ GPS ไม่ตรงแผนงาน', mismatchMsg, '/attendance')
          await _notifyRole('CEO', 'SYSTEM', '⚠️ GPS ไม่ตรงแผนงาน', mismatchMsg, '/attendance')
        } catch (err) {
          console.error('[mismatch-notify]', err)
        }
      })
    }

    // Auto-warning: check late count after LATE check-in
    if (isFirstSessionOfDay && status === 'LATE') {
      const uidForWarning = session.user.id
      const employeeName = session.user.name ?? 'พนักงาน'
      const lateMsg = `${employeeName} เช็คอินมาสาย ${lateMinutes} นาที`
      after(async () => {
        const { checkAndCreateAutoWarning } = await import('@/lib/warning-auto')
        await checkAndCreateAutoWarning(uidForWarning).catch((err) =>
          console.error('[warning-auto]', err),
        )
        try {
          const { notifyRole } = await import('@/lib/notifications')
          await notifyRole('MANAGER_HR', 'SYSTEM', '🕐 พนักงานมาสาย', lateMsg, '/attendance')
          await notifyRole('TEAM_LEADER', 'SYSTEM', '🕐 พนักงานมาสาย', lateMsg, '/attendance')
        } catch (err) {
          console.error('[late-notify]', err)
        }
      })
    }

    const weeklyPlanWarning = locationStatus === 'mismatch' && locationDistance != null
      ? `⚠️ GPS ไม่ตรงแผนงาน — ห่าง ${Math.round(locationDistance)} เมตร จาก "${plannedPlace ?? '—'}" (อนุญาต ${WEEKLY_PLAN_LOCATION_TOLERANCE_METERS} ม.)`
      : null

    return NextResponse.json({
      success: true,
      attendance: finalized,
      isOutside,
      outsideWorkApproved: !!outsideWorkRequestId,
      outsidePlace: approvedOutsideWork?.place ?? null,
      lateMinutes: isFirstSessionOfDay ? lateMinutes : 0,
      sessionIndex,
      weeklyPlanWarning,
      locationStatus,
      locationDistance: locationDistance ? Math.round(locationDistance) : null,
      plannedPlace,
    })
  } catch (err) {
    return apiError(err)
  }
}
