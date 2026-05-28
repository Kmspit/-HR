import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Topbar from '@/components/dashboard/Topbar'
import CalendarClient from './CalendarClient'
import { ensureDbSchema } from '@/lib/ensure-db-schema'

export const metadata = { title: 'ปฏิทิน' }

export default async function CalendarPage() {
  const session = await auth()
  if (!session?.user) redirect('/')

  await ensureDbSchema()

  const { id: userId, role, name, branchId } = session.user
  const canManageHolidays = ['MANAGER_HR', 'ADMIN'].includes(role)

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const [attendanceRecords, leaveRecords, holidayRows, branches] = await Promise.all([
    prisma.attendance.findMany({
      where: {
        userId,
        date: { gte: monthStart, lte: monthEnd },
      },
      select: { date: true, status: true, checkIn: true, checkOut: true, lateMinutes: true },
    }),
    prisma.leaveRequest.findMany({
      where: {
        userId,
        status: { in: ['APPROVED', 'ADMIN_APPROVED'] },
        startDate: { lte: monthEnd },
        endDate: { gte: monthStart },
      },
      select: { startDate: true, endDate: true, type: true, status: true },
    }),
    prisma.companyHoliday.findMany({
      where: {
        OR: [{ branchId: null }, ...(branchId ? [{ branchId }] : [])],
      },
      orderBy: [{ holidayDate: 'asc' }, { holidayName: 'asc' }],
      include: { branch: { select: { id: true, name: true, code: true } } },
    }),
    canManageHolidays
      ? prisma.companyBranch.findMany({
          where: { isActive: true },
          orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
          select: { id: true, name: true, code: true },
        })
      : Promise.resolve([]),
  ])

  const holidaysForClient = holidayRows.map((h) => ({
    id: h.id,
    holidayName: h.holidayName,
    holidayDate: h.holidayDate.toISOString().slice(0, 10),
    holidayType: h.holidayType,
    repeatEveryYear: h.repeatEveryYear,
    branchId: h.branchId,
    branchLabel: h.branch ? `${h.branch.name} (${h.branch.code})` : 'ทุกสาขา',
  }))

  return (
    <div className="flex flex-col">
      <Topbar
        title="ปฏิทิน"
        subtitle={
          canManageHolidays
            ? 'บันทึกการเข้างานรายวัน · จัดการวันหยุดบริษัท'
            : 'บันทึกการเข้างานรายวัน · ดูวันหยุดบริษัท'
        }
      />
      <CalendarClient
        attendance={attendanceRecords.map((r) => ({
          ...r,
          date: r.date.toISOString(),
          checkIn: r.checkIn?.toISOString() ?? null,
          checkOut: r.checkOut?.toISOString() ?? null,
        }))}
        leaves={leaveRecords.map((r) => ({
          startDate: r.startDate.toISOString(),
          endDate: r.endDate.toISOString(),
          type: r.type,
        }))}
        year={now.getFullYear()}
        month={now.getMonth()}
        branchId={branchId ?? null}
        initialHolidays={holidaysForClient}
        branches={branches.map((b) => ({ id: b.id, label: `${b.name} (${b.code})` }))}
        canManageHolidays={canManageHolidays}
      />
    </div>
  )
}
