import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const SS_RATE = 0.05
const SS_MAX = 750

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { month, year } = await req.json()
  if (!month || !year) return NextResponse.json({ error: 'month and year required' }, { status: 400 })

  const settings = await prisma.companySettings.findUnique({ where: { id: 'singleton' } })
  const lateRate = settings?.lateDeductRate ?? 0   // เธเธฒเธ—/เธเธฒเธ—เธต
  const absentRate = settings?.absentDeductRate ?? 0  // เธเธฒเธ—/เธงเธฑเธ

  const employees = await prisma.user.findMany({
    where: { status: 'ACTIVE', isCoworker: false },
    select: { id: true, baseSalary: true, socialSecurity: true },
  })

  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0, 23, 59, 59)

  const results = await Promise.all(
    employees.map(async (emp) => {
      if (!emp.baseSalary) return null

      const attendances = await prisma.attendance.findMany({
        where: { userId: emp.id, date: { gte: startDate, lte: endDate } },
      })

      const totalLateMinutes = attendances.reduce((s, a) => s + (a.lateMinutes ?? 0), 0)
      const absentDays = attendances.filter((a) => a.status === 'ABSENT').length
      const lateDays = attendances.filter((a) => a.status === 'LATE').length

      // Approved unpaid leave
      const unpaidLeaves = await prisma.leaveRequest.findMany({
        where: {
          userId: emp.id,
          type: 'UNPAID',
          status: 'APPROVED',
          startDate: { gte: startDate, lte: endDate },
        },
      })
      const unpaidDays = unpaidLeaves.reduce((s, l) => s + l.days, 0)

      const dailyRate = emp.baseSalary / 26
      const lateDeduction = lateRate > 0 ? totalLateMinutes * lateRate : 0
      const absentDeduction = absentDays * dailyRate + (absentRate > 0 ? absentDays * absentRate : 0)
      const unpaidLeaveDeduction = unpaidDays * dailyRate

      let ssDeduction = 0
      if (emp.socialSecurity) {
        ssDeduction = Math.min(emp.baseSalary * SS_RATE, SS_MAX)
      }

      const netSalary = emp.baseSalary - lateDeduction - absentDeduction - unpaidLeaveDeduction - ssDeduction

      return prisma.payroll.upsert({
        where: { userId_month_year: { userId: emp.id, month, year } },
        update: {
          baseSalary: emp.baseSalary,
          lateDeduction,
          absentDeduction,
          unpaidLeave: unpaidLeaveDeduction,
          socialSecurity: ssDeduction,
          netSalary,
          lateDays,
          absentDays,
          lateMinutes: totalLateMinutes,
          status: 'DRAFT',
        },
        create: {
          userId: emp.id,
          month,
          year,
          baseSalary: emp.baseSalary,
          lateDeduction,
          absentDeduction,
          unpaidLeave: unpaidLeaveDeduction,
          socialSecurity: ssDeduction,
          netSalary,
          lateDays,
          absentDays,
          lateMinutes: totalLateMinutes,
          status: 'DRAFT',
        },
      })
    })
  )

  return NextResponse.json({ success: true, count: results.filter(Boolean).length })
}
