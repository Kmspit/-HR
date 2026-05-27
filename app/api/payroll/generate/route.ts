import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { monthDateRange } from '@/lib/utils'
import { buildBranchScope, branchUserWhere } from '@/lib/branch-scope'

const PAYROLL_ROLES = ['EMPLOYEE', 'MANAGER_HR', 'LAWYER'] as const

const SS_RATE = 0.05
const SS_MAX = 750

export async function POST(req: NextRequest) {
  try {
  const session = await auth()
  if (!session?.user?.id || !['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { month, year, branchId: filterBranchId } = await req.json()
  if (!month || !year) return NextResponse.json({ error: 'month and year required' }, { status: 400 })

  const scope = buildBranchScope(
    { role: session.user.role, branchId: session.user.branchId },
    { branchId: filterBranchId },
  )

  const settings = await prisma.companySettings.findUnique({ where: { id: 'singleton' } })
  const lateRate = settings?.lateDeductRate ?? 0   // เธเธฒเธ—/เธเธฒเธ—เธต
  const absentRate = settings?.absentDeductRate ?? 0  // เธเธฒเธ—/เธงเธฑเธ

  const employees = await prisma.user.findMany({
    where: branchUserWhere(scope, { status: 'ACTIVE', role: { in: [...PAYROLL_ROLES] } }),
    select: { id: true, baseSalary: true, socialSecurity: true },
  })

  const { start: startDate, end: endDate } = monthDateRange(month, year)

  const results = await Promise.all(
    employees.map(async (emp) => {
      const baseSalary = emp.baseSalary ?? 0

      const attendances = await prisma.attendance.findMany({
        where: { userId: emp.id, date: { gte: startDate, lte: endDate } },
      })

      const totalLateMinutes = attendances.reduce((s, a) => s + (a.lateMinutes ?? 0), 0)
      const absentDays = attendances.filter((a) => a.status === 'ABSENT').length
      const lateDays = attendances.filter((a) => a.status === 'LATE').length

      // Approved unpaid leave
      const unpaidTypes = ['UNPAID'] as const
      const unpaidLeaves = await prisma.leaveRequest.findMany({
        where: {
          userId: emp.id,
          type: { in: [...unpaidTypes] },
          status: 'APPROVED',
          startDate: { lte: endDate },
          endDate: { gte: startDate },
        },
      })
      const unpaidDays = unpaidLeaves.reduce((s, l) => s + l.days, 0)

      const earlyLeaveDays = attendances.filter(
        (a) => a.status === 'EARLY_LEAVE' || (a.earlyLeaveMinutes ?? 0) > 0,
      ).length

      const dailyRate = baseSalary / 26
      const lateDeduction =
        lateRate > 0 ? totalLateMinutes * lateRate + lateDays * dailyRate * 0.1 : lateDays * dailyRate * 0.1
      const absentDeduction = absentDays * dailyRate + (absentRate > 0 ? absentDays * absentRate : 0)
      const unpaidLeaveDeduction = unpaidDays * dailyRate
      const earlyLeaveDeduction = earlyLeaveDays * dailyRate * 0.5

      let ssDeduction = 0
      if (emp.socialSecurity && baseSalary > 0) {
        ssDeduction = Math.min(baseSalary * SS_RATE, SS_MAX)
      }

      const netSalary =
        baseSalary - lateDeduction - absentDeduction - unpaidLeaveDeduction - earlyLeaveDeduction - ssDeduction

      return prisma.payroll.upsert({
        where: { userId_month_year: { userId: emp.id, month, year } },
        update: {
          baseSalary,
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
          baseSalary,
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
  } catch (err) {
    return apiError(err)
  }
}
