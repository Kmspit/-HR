import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import AttendanceClient from './AttendanceClient'

export default async function AttendancePage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/')

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const companySettings = await prisma.companySettings.findUnique({ where: { id: 'singleton' } })

  const [todayRecord, recentRecords, leaveBalance] = await Promise.all([
    prisma.attendance.findUnique({
      where: { userId_date: { userId: session.user.id, date: today } },
    }),
    prisma.attendance.findMany({
      where: { userId: session.user.id },
      orderBy: { date: 'desc' },
      take: 15,
    }),
    prisma.leaveBalance.findUnique({
      where: { userId_year: { userId: session.user.id, year: new Date().getFullYear() } },
    }),
  ])

  // Manager/Admin: also get all employee attendance today
  let allToday: { id: string; name: string; status: string; checkIn: string | null; checkOut: string | null }[] = []
  if (['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
    const records = await prisma.attendance.findMany({
      where: { date: today },
      include: { user: { select: { name: true } } },
    })
    allToday = records.map((r) => ({
      id: r.userId,
      name: r.user.name,
      status: r.status,
      checkIn: r.checkIn?.toISOString() ?? null,
      checkOut: r.checkOut?.toISOString() ?? null,
    }))
  }

  return (
    <AttendanceClient
      role={session.user.role}
      companyOffice={
        companySettings
          ? {
              name: companySettings.companyName,
              address: companySettings.officeAddress ?? '',
            }
          : null
      }
      todayRecord={todayRecord ? {
        id: todayRecord.id,
        checkIn: todayRecord.checkIn?.toISOString() ?? null,
        checkOut: todayRecord.checkOut?.toISOString() ?? null,
        lunchOut: todayRecord.lunchOut?.toISOString() ?? null,
        lunchIn: todayRecord.lunchIn?.toISOString() ?? null,
        status: todayRecord.status,
        lateMinutes: todayRecord.lateMinutes ?? 0,
        earlyLeaveMinutes: todayRecord.earlyLeaveMinutes ?? 0,
        isOutside: todayRecord.isOutside ?? false,
        address: todayRecord.address ?? null,
        workPlaceName: todayRecord.workPlaceName ?? null,
        photoUrl: todayRecord.photoUrl ?? null,
        lat: todayRecord.lat ?? null,
        lng: todayRecord.lng ?? null,
      } : null}
      recentRecords={recentRecords.map((r) => ({
        id: r.id,
        date: r.date.toISOString(),
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
  )
}
