import { prisma } from '@/lib/prisma'
import { LEAVE_TYPE_LABELS } from '@/lib/leave-types'
import { monthDateRange } from '@/lib/utils'
import type { HolidayRecord } from '@/lib/company-holidays'
import { buildApprovedLeaveDateSet, computeLateDeduction } from '@/lib/payroll-late-deduction'

/** พนักงานที่แสดงในรายงานรายเดือน */
const REPORT_ROLES = ['EMPLOYEE', 'MANAGER_HR', 'LAWYER'] as const

export async function buildMonthlyReport(month: number, year: number, filterBranchId?: string) {
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
    where: {
      status: 'ACTIVE',
      role: { in: [...REPORT_ROLES] },
      ...(filterBranchId ? { branchId: filterBranchId } : {}),
    },
    select: {
      id: true,
      name: true,
      employeeId: true,
      department: true,
      role: true,
      baseSalary: true,
      branchId: true,
    },
    orderBy: { name: 'asc' },
  })

  const rows = await Promise.all(
    employees.map(async (emp) => {
      const attendances = await prisma.attendance.findMany({
        where: { userId: emp.id, date: { gte: startDate, lte: endDate } },
        orderBy: { date: 'asc' },
      })

      const leaves = await prisma.leaveRequest.findMany({
        where: {
          userId: emp.id,
          status: { in: ['APPROVED', 'ADMIN_APPROVED'] },
          startDate: { lte: endDate },
          endDate: { gte: startDate },
        },
      })

      const leaveByType: Record<string, number> = {}
      for (const l of leaves) {
        leaveByType[l.type] = (leaveByType[l.type] ?? 0) + l.days
      }

      const workDays = attendances.filter((a) => a.checkIn).length
      const lateDays = attendances.filter((a) => a.status === 'LATE').length
      const lateMinutes = attendances.reduce((s, a) => s + (a.lateMinutes ?? 0), 0)

      const leaveDateKeys = buildApprovedLeaveDateSet(leaves, startDate, endDate)
      const lateCalc = computeLateDeduction({
        baseSalary: emp.baseSalary ?? 0,
        attendances,
        leaveDateKeys,
        holidays,
        branchId: emp.branchId,
      })
      const earlyLeaveDays = attendances.filter(
        (a) => a.status === 'EARLY_LEAVE' || (a.earlyLeaveMinutes ?? 0) > 0,
      ).length
      const absentDays = attendances.filter((a) => a.status === 'ABSENT').length

      return {
        userId: emp.id,
        name: emp.name,
        employeeId: emp.employeeId,
        department: emp.department,
        role: emp.role,
        workDays,
        lateDays,
        lateMinutes,
        billableLateMinutes: lateCalc.billableLateMinutes,
        estimatedLateDeduction: lateCalc.lateDeduction,
        payrollLateDays: lateCalc.lateDays,
        earlyLeaveDays,
        absentDays,
        leaveByType: Object.entries(leaveByType).map(([type, days]) => ({
          type,
          label: LEAVE_TYPE_LABELS[type] ?? type,
          days,
        })),
        attendances: attendances.map((a) => ({
          date: a.date.toISOString(),
          checkIn: a.checkIn?.toISOString() ?? null,
          lunchOut: a.lunchOut?.toISOString() ?? null,
          lunchIn: a.lunchIn?.toISOString() ?? null,
          checkOut: a.checkOut?.toISOString() ?? null,
          workPlaceName: a.workPlaceName,
          lateMinutes: a.lateMinutes,
          earlyLeaveMinutes: a.earlyLeaveMinutes,
          status: a.status,
          lat: a.lat,
          lng: a.lng,
        })),
      }
    }),
  )

  const lateSummary = {
    employeesWithLate: rows.filter((r) => r.payrollLateDays > 0).length,
    totalBillableLateMinutes: rows.reduce((s, r) => s + r.billableLateMinutes, 0),
    totalEstimatedLateDeduction: rows.reduce((s, r) => s + r.estimatedLateDeduction, 0),
    totalRecordedLateMinutes: rows.reduce((s, r) => s + r.lateMinutes, 0),
  }

  return {
    month,
    year,
    employeeCount: rows.length,
    generatedAt: new Date().toISOString(),
    lateSummary,
    employees: rows,
  }
}
