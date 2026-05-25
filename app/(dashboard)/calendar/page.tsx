import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Topbar from '@/components/dashboard/Topbar'
import CalendarClient from './CalendarClient'

export const metadata = { title: 'ปฏิทิน' }

export default async function CalendarPage() {
  const session = await auth()
  if (!session?.user) redirect('/')

  const { id: userId, role, name } = session.user

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  // Attendance records for current month
  const attendanceRecords = await prisma.attendance.findMany({
    where: {
      userId,
      date: { gte: monthStart, lte: monthEnd },
    },
    select: { date: true, status: true, checkIn: true, checkOut: true, lateMinutes: true },
  })

  // Leave requests for current month
  const leaveRecords = await prisma.leaveRequest.findMany({
    where: {
      userId,
      status: { in: ['APPROVED', 'ADMIN_APPROVED'] },
      startDate: { lte: monthEnd },
      endDate:   { gte: monthStart },
    },
    select: { startDate: true, endDate: true, type: true, status: true },
  })

  const user = {
    name: name ?? '',
    email: session.user.email ?? '',
    role,
    department: session.user.department,
  }

  return (
    <div className="flex flex-col">
      <Topbar title="ปฏิทิน" subtitle="บันทึกการเข้างานรายวัน" />
      <CalendarClient
        attendance={attendanceRecords.map(r => ({
          ...r,
          date: r.date.toISOString(),
          checkIn: r.checkIn?.toISOString() ?? null,
          checkOut: r.checkOut?.toISOString() ?? null,
        }))}
        leaves={leaveRecords.map(r => ({
          startDate: r.startDate.toISOString(),
          endDate: r.endDate.toISOString(),
          type: r.type,
        }))}
        year={now.getFullYear()}
        month={now.getMonth()}
      />
    </div>
  )
}
