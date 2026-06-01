import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { KM_COMPANY } from '@/lib/company-defaults'
import { redirect } from 'next/navigation'
import AttendanceClient from './AttendanceClient'
import BranchFilterBar from '@/components/dashboard/BranchFilterBar'
import { buildBranchScope, branchUserWhere, parseBranchQueryParam } from '@/lib/branch-scope'
import {
  findActiveAttendanceSession,
  findTodayAttendanceSessions,
  pickDisplaySessionForDay,
} from '@/lib/attendance-session'
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

  const companySettings = await prisma.companySettings.findUnique({
    where: { id: 'singleton' },
    select: {
      companyName: true,
      geofenceLat: true,
      geofenceLng: true,
      geofenceRadius: true,
    },
  })

  const profile = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { employeeId: true },
  })

  const [activeSession, todaySessions, recentRecords, leaveBalance] = await Promise.all([
    findActiveAttendanceSession(session.user.id, today),
    findTodayAttendanceSessions(session.user.id, today),
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
        companySettings
          ? {
              name: companySettings.companyName,
              address: KM_COMPANY.officeAddress,
            }
          : null
      }
      companyGeofence={
        companySettings?.geofenceLat != null && companySettings?.geofenceLng != null
          ? {
              name: companySettings.companyName,
              address: KM_COMPANY.officeAddress,
              lat: companySettings.geofenceLat,
              lng: companySettings.geofenceLng,
              radiusM: companySettings.geofenceRadius ?? 250,
            }
          : null
      }
      todayRecord={activeSession ? {
        id: activeSession.id,
        sessionIndex: activeSession.sessionIndex,
        checkIn: activeSession.checkIn?.toISOString() ?? null,
        checkOut: activeSession.checkOut?.toISOString() ?? null,
        lunchOut: activeSession.lunchOut?.toISOString() ?? null,
        lunchIn: activeSession.lunchIn?.toISOString() ?? null,
        status: activeSession.status,
        lateMinutes: activeSession.lateMinutes ?? 0,
        earlyLeaveMinutes: activeSession.earlyLeaveMinutes ?? 0,
        isOutside: activeSession.isOutside ?? false,
        address: activeSession.address ?? null,
        workPlaceName: activeSession.workPlaceName ?? null,
        photoUrl: activeSession.photoUrl ?? null,
        checkOutPhotoUrl: activeSession.checkOutPhotoUrl ?? null,
        lunchOutPhotoUrl: activeSession.lunchOutPhotoUrl ?? null,
        lunchInPhotoUrl: activeSession.lunchInPhotoUrl ?? null,
        lat: activeSession.lat ?? null,
        lng: activeSession.lng ?? null,
      } : null}
      todaySessions={todaySessions.map((r) => ({
        id: r.id,
        sessionIndex: r.sessionIndex,
        checkIn: r.checkIn?.toISOString() ?? null,
        checkOut: r.checkOut?.toISOString() ?? null,
        lunchOut: r.lunchOut?.toISOString() ?? null,
        lunchIn: r.lunchIn?.toISOString() ?? null,
        status: r.status,
        isOutside: r.isOutside ?? false,
        workPlaceName: r.workPlaceName ?? null,
      }))}
      completedSessionsToday={todaySessions.filter((s) => s.checkIn && s.checkOut).length}
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
