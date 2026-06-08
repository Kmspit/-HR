import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { KM_COMPANY } from '@/lib/company-defaults'
import { redirect } from 'next/navigation'
import AttendanceClient from './AttendanceClient'
import BranchFilterBar from '@/components/dashboard/BranchFilterBar'
import { buildBranchScope, branchUserWhere, parseBranchQueryParam } from '@/lib/branch-scope'
import {
  findTodayAttendanceForDisplay,
  pickDisplaySessionForDay,
} from '@/lib/attendance-session'
import { getAttendanceProgress } from '@/lib/attendance-progress'
import { Suspense } from 'react'

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/')
  const sp = await searchParams
  const branchParam = parseBranchQueryParam(sp.branchId)
  const scope = buildBranchScope(session.user, { branchId: branchParam })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [companySettings, profile] = await Promise.all([
    prisma.companySettings.findUnique({
      where: { id: 'singleton' },
      select: { companyName: true, geofenceLat: true, geofenceLng: true, geofenceRadius: true },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        employeeId: true,
        branch: { select: { lat: true, lng: true, radiusMeters: true, name: true, address: true } },
      },
    }),
  ])

  // เลือก geofence สำหรับ client-side pre-check:
  // - ถ้า user มี branch → ใช้ coords ของ branch เท่านั้น
  //   ถ้า branch ยังไม่ตั้ง coords → ไม่ส่ง geofence ให้ client (ข้ามการ block)
  // - ถ้า user ไม่มี branch → ใช้ CompanySettings (backward compat)
  let geofenceLat: number | null
  let geofenceLng: number | null
  let geofenceRadius: number
  let geofenceName: string
  let geofenceAddress: string
  if (profile?.branch) {
    geofenceLat = profile.branch.lat
    geofenceLng = profile.branch.lng
    geofenceRadius = profile.branch.radiusMeters
    geofenceName = profile.branch.name ?? companySettings?.companyName ?? 'สำนักงาน'
    geofenceAddress = profile.branch.address ?? KM_COMPANY.officeAddress
  } else {
    geofenceLat = companySettings?.geofenceLat ?? null
    geofenceLng = companySettings?.geofenceLng ?? null
    geofenceRadius = companySettings?.geofenceRadius ?? 200
    geofenceName = companySettings?.companyName ?? 'สำนักงาน'
    geofenceAddress = KM_COMPANY.officeAddress
  }

  const [displaySession, recentRecords, leaveBalance] = await Promise.all([
    findTodayAttendanceForDisplay(session.user.id, today),
    prisma.attendance.findMany({
      where: { userId: session.user.id, checkIn: { not: null } },
      orderBy: [{ date: 'desc' }, { sessionIndex: 'desc' }],
      take: 20,
    }),
    prisma.leaveBalance.findUnique({
      where: { userId_year: { userId: session.user.id, year: new Date().getFullYear() } },
    }),
  ])

  // Manager/Admin: แสดงพนักงานทุกคน (รวมที่ยังไม่เช็คอินวันนี้)
  const TEAM_ROLES = ['EMPLOYEE', 'MANAGER_HR', 'LAWYER'] as const
  let allToday: {
    id: string
    name: string
    department: string | null
    status: string
    checkIn: string | null
    checkOut: string | null
    hasCheckedIn: boolean
  }[] = []
  if (['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
    const [employees, records] = await Promise.all([
      prisma.user.findMany({
        where: branchUserWhere(scope, { status: 'ACTIVE', role: { in: [...TEAM_ROLES] } }),
        select: { id: true, name: true, department: true },
        orderBy: { name: 'asc' },
      }),
      prisma.attendance.findMany({
        where: { date: today },
      }),
    ])
    const attByUser = new Map<string, ReturnType<typeof pickDisplaySessionForDay>>()
    for (const uid of new Set(records.map((r) => r.userId))) {
      const userSessions = records.filter((r) => r.userId === uid)
      attByUser.set(uid, pickDisplaySessionForDay(userSessions))
    }
    allToday = employees.map((emp) => {
      const a = attByUser.get(emp.id)
      return {
        id: emp.id,
        name: emp.name,
        department: emp.department,
        status: a?.status ?? 'NONE',
        checkIn: a?.checkIn?.toISOString() ?? null,
        checkOut: a?.checkOut?.toISOString() ?? null,
        hasCheckedIn: !!a?.checkIn,
      }
    })
  }

  return (
    <>
    {['MANAGER_HR', 'ADMIN'].includes(session.user.role) && (
      <Suspense fallback={null}>
        <BranchFilterBar role={session.user.role} filterBranchId={branchParam} />
      </Suspense>
    )}
    <AttendanceClient
      role={session.user.role}
      userId={session.user.id}
      userName={session.user.name ?? 'พนักงาน'}
      employeeCode={profile?.employeeId ?? null}
      companyOffice={
        companySettings ? { name: geofenceName, address: geofenceAddress } : null
      }
      companyGeofence={
        geofenceLat != null && geofenceLng != null
          ? {
              name: geofenceName,
              address: geofenceAddress,
              lat: geofenceLat,
              lng: geofenceLng,
              radiusM: geofenceRadius,
            }
          : null
      }
      todayRecord={displaySession ? {
        id: displaySession.id,
        sessionIndex: displaySession.sessionIndex,
        checkIn: displaySession.checkIn?.toISOString() ?? null,
        checkOut: displaySession.checkOut?.toISOString() ?? null,
        lunchOut: displaySession.lunchOut?.toISOString() ?? null,
        lunchIn: displaySession.lunchIn?.toISOString() ?? null,
        status: displaySession.status,
        lateMinutes: displaySession.lateMinutes ?? 0,
        earlyLeaveMinutes: displaySession.earlyLeaveMinutes ?? 0,
        isOutside: displaySession.isOutside ?? false,
        address: displaySession.address ?? null,
        workPlaceName: displaySession.workPlaceName ?? null,
        photoUrl: displaySession.photoUrl ?? null,
        checkOutPhotoUrl: displaySession.checkOutPhotoUrl ?? null,
        lunchOutPhotoUrl: displaySession.lunchOutPhotoUrl ?? null,
        lunchInPhotoUrl: displaySession.lunchInPhotoUrl ?? null,
        lat: displaySession.lat ?? null,
        lng: displaySession.lng ?? null,
      } : null}
      dayComplete={getAttendanceProgress(displaySession).dayComplete}
      recentRecords={recentRecords.map((r) => ({
        id: r.id,
        date: r.date.toISOString(),
        sessionIndex: r.sessionIndex,
        checkIn: r.checkIn?.toISOString() ?? null,
        checkOut: r.checkOut?.toISOString() ?? null,
        lunchOut: r.lunchOut?.toISOString() ?? null,
        lunchIn: r.lunchIn?.toISOString() ?? null,
        status: r.status,
        lateMinutes: r.lateMinutes ?? 0,
        isOutside: r.isOutside ?? false,
        workPlaceName: r.workPlaceName ?? null,
        lat: r.lat ?? null,
        lng: r.lng ?? null,
      }))}
      leaveBalance={leaveBalance ? {
        sick: leaveBalance.sick,
        vacation: leaveBalance.vacation,
        personal: leaveBalance.personal,
      } : null}
      allToday={allToday}
    />
    </>
  )
}
