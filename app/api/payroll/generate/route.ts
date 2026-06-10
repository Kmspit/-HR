import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { monthDateRange } from '@/lib/utils'
import { buildBranchScope, branchUserWhere } from '@/lib/branch-scope'
import { ensureDbSchema } from '@/lib/ensure-db-schema'
import {
  buildApprovedLeaveDateSet,
  computeLateDeduction,
  serializeLateDeductionDetail,
} from '@/lib/payroll-late-deduction'
import { computeMonthlyTax } from '@/lib/payroll-tax'
import type { HolidayRecord } from '@/lib/company-holidays'

const PAYROLL_ROLES = ['EMPLOYEE', 'MANAGER_HR', 'LAWYER'] as const

const SS_RATE = 0.05
const SS_MAX = 750

const GENERATE_ROLES = ['MANAGER_HR', 'ADMIN', 'CEO', 'SUPER_ADMIN', 'HR'] as const

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id || !(GENERATE_ROLES as readonly string[]).includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await ensureDbSchema()

    const { month, year, branchId: filterBranchId } = await req.json()
    if (!month || !year) {
      return NextResponse.json({ error: 'month and year required' }, { status: 400 })
    }

    const scope = buildBranchScope(
      { role: session.user.role, branchId: session.user.branchId },
      { branchId: filterBranchId },
    )

    const settings = await prisma.companySettings.findUnique({ where: { id: 'singleton' } })
    const absentRate = settings?.absentDeductRate ?? 0

    const { start: startDate, end: endDate } = monthDateRange(month, year)

    const holidayRows = await prisma.companyHoliday.findMany({
      orderBy: [{ holidayDate: 'asc' }],
    })
    const holidays: HolidayRecord[] = holidayRows.map((h) => ({
      id: h.id,
      holidayName: h.holidayName,
      holidayDate: h.holidayDate,
      holidayType: h.holidayType,
      repeatEveryYear: h.repeatEveryYear,
      branchId: h.branchId,
    }))

    const employees = await prisma.user.findMany({
      where: branchUserWhere(scope, { status: 'ACTIVE', role: { in: [...PAYROLL_ROLES] } }),
      select: { id: true, baseSalary: true, socialSecurity: true, branchId: true },
    })

    const results = await Promise.all(
      employees.map(async (emp) => {
        const baseSalary = emp.baseSalary ?? 0

        const [attendances, approvedLeaves, unpaidLeaves] = await Promise.all([
          prisma.attendance.findMany({
            where: { userId: emp.id, date: { gte: startDate, lte: endDate } },
            select: {
              date: true,
              lateMinutes: true,
              status: true,
              earlyLeaveMinutes: true,
              workMinutes: true,
              leaveType: true,
              checkIn: true,
            },
          }),
          prisma.leaveRequest.findMany({
            where: {
              userId: emp.id,
              status: { in: ['APPROVED', 'ADMIN_APPROVED'] },
              startDate: { lte: endDate },
              endDate: { gte: startDate },
            },
            select: { startDate: true, endDate: true, status: true },
          }),
          prisma.leaveRequest.findMany({
            where: {
              userId: emp.id,
              type: 'UNPAID',
              status: { in: ['APPROVED', 'ADMIN_APPROVED'] },
              startDate: { lte: endDate },
              endDate: { gte: startDate },
            },
            select: { days: true },
          }),
        ])

        const leaveDateKeys = buildApprovedLeaveDateSet(approvedLeaves, startDate, endDate)

        const late = computeLateDeduction({
          baseSalary,
          attendances,
          leaveDateKeys,
          holidays,
          branchId: emp.branchId,
        })

        const absentDays = attendances.filter((a) => a.status === 'ABSENT').length
        const earlyLeaveDays = attendances.filter(
          (a) => a.status === 'EARLY_LEAVE' || (a.earlyLeaveMinutes ?? 0) > 0,
        ).length

        const unpaidDays = unpaidLeaves.reduce((s, l) => s + l.days, 0)

        const dailyRate = baseSalary / 26
        const lateDeduction = late.lateDeduction
        const absentDeduction = absentDays * dailyRate + (absentRate > 0 ? absentDays * absentRate : 0)
        const unpaidLeaveDeduction = unpaidDays * dailyRate
        const earlyLeaveDeduction = earlyLeaveDays * dailyRate * 0.5

        let ssDeduction = 0
        if (emp.socialSecurity && baseSalary > 0) {
          ssDeduction = Math.min(baseSalary * SS_RATE, SS_MAX)
        }

        const taxResult = computeMonthlyTax(baseSalary)
        const taxDeduction = taxResult.monthlyWithholding

        const netSalary =
          baseSalary -
          lateDeduction -
          absentDeduction -
          unpaidLeaveDeduction -
          earlyLeaveDeduction -
          ssDeduction -
          taxDeduction

        const payload = {
          baseSalary,
          lateDeduction,
          absentDeduction,
          unpaidLeave: unpaidLeaveDeduction,
          socialSecurity: ssDeduction,
          taxDeduction,
          taxDetail: JSON.stringify(taxResult),
          netSalary,
          lateDays: late.lateDays,
          absentDays,
          lateMinutes: late.billableLateMinutes,
          lateBillableMinutes: late.billableLateMinutes,
          lateDeductionDetail: serializeLateDeductionDetail(late.lines),
          status: 'DRAFT',
        }

        return prisma.payroll.upsert({
          where: { userId_month_year: { userId: emp.id, month, year } },
          update: payload,
          create: { userId: emp.id, month, year, ...payload },
        })
      }),
    )

    return NextResponse.json({ success: true, count: results.filter(Boolean).length })
  } catch (err) {
    return apiError(err)
  }
}
