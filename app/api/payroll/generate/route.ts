import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { monthDateRange } from '@/lib/utils'
import { buildBranchScope, branchUserWhere } from '@/lib/branch-scope'
import {
  buildApprovedLeaveDateSet,
  computeLateDeduction,
  serializeLateDeductionDetail,
  roundMoney,
} from '@/lib/payroll-late-deduction'
import { computeMonthlyTax } from '@/lib/payroll-tax'
import type { HolidayRecord } from '@/lib/company-holidays'

const PAYROLL_ROLES = ['EMPLOYEE', 'MANAGER_HR', 'LAWYER'] as const

const SS_RATE = 0.05
const SS_MAX = 750

const GENERATE_ROLES = ['MANAGER_HR', 'ADMIN', 'CEO', 'SUPER_ADMIN', 'HR'] as const

/** Inclusive calendar-day count between two dates, ignoring time-of-day. */
function daysBetweenInclusive(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id || !(GENERATE_ROLES as readonly string[]).includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { month, year, branchId: filterBranchId } = await req.json()
    if (!month || !year) {
      return NextResponse.json({ error: 'month and year required' }, { status: 400 })
    }

    const scope = buildBranchScope(
      { role: session.user.role, branchId: session.user.branchId },
      { branchId: filterBranchId },
    )

    const settings = await prisma.companySettings.findUnique({
      where: { id: 'singleton' },
      select: { absentDeductRate: true },
    })
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
      select: { id: true, name: true, baseSalary: true, socialSecurity: true, branchId: true, startDate: true },
    })

    // Never silently recalculate over a payroll HR has already approved — that
    // would overwrite approvedById/approvedAt semantics with fresh DRAFT numbers
    // underneath them. Skip those employees and report exactly who was skipped.
    const existingApproved = await prisma.payroll.findMany({
      where: {
        month, year, status: 'APPROVED',
        userId: { in: employees.map((e) => e.id) },
      },
      select: { userId: true },
    })
    const approvedUserIds = new Set(existingApproved.map((p) => p.userId))
    const skippedApproved = employees.filter((e) => approvedUserIds.has(e.id))
    const pendingEmployees = employees.filter((e) => !approvedUserIds.has(e.id))

    // Batch-fetch once for all pending employees instead of 3 queries per
    // employee — grouped into per-user buckets below so the per-employee
    // computation loop reads unchanged (same shape as the old per-user
    // findMany results, just sourced from a Map instead of a fresh query).
    const pendingIds = pendingEmployees.map((e) => e.id)

    const [allAttendances, allApprovedLeaves, allUnpaidLeaves] = await Promise.all([
      prisma.attendance.findMany({
        where: { userId: { in: pendingIds }, date: { gte: startDate, lte: endDate } },
        select: {
          userId: true,
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
          userId: { in: pendingIds },
          status: { in: ['APPROVED', 'ADMIN_APPROVED'] },
          startDate: { lte: endDate },
          endDate: { gte: startDate },
        },
        select: { userId: true, startDate: true, endDate: true, status: true },
      }),
      prisma.leaveRequest.findMany({
        where: {
          userId: { in: pendingIds },
          type: 'UNPAID',
          status: { in: ['APPROVED', 'ADMIN_APPROVED'] },
          startDate: { lte: endDate },
          endDate: { gte: startDate },
        },
        select: { userId: true, days: true },
      }),
    ])

    const attendancesByUser = new Map<string, typeof allAttendances>()
    for (const a of allAttendances) {
      const list = attendancesByUser.get(a.userId)
      if (list) list.push(a); else attendancesByUser.set(a.userId, [a])
    }
    const approvedLeavesByUser = new Map<string, typeof allApprovedLeaves>()
    for (const l of allApprovedLeaves) {
      const list = approvedLeavesByUser.get(l.userId)
      if (list) list.push(l); else approvedLeavesByUser.set(l.userId, [l])
    }
    const unpaidLeavesByUser = new Map<string, typeof allUnpaidLeaves>()
    for (const l of allUnpaidLeaves) {
      const list = unpaidLeavesByUser.get(l.userId)
      if (list) list.push(l); else unpaidLeavesByUser.set(l.userId, [l])
    }

    // Employees whose payroll got APPROVED by someone else between the
    // `existingApproved` read above and this employee's write below — caught
    // by the fresh in-transaction status re-check just before the upsert.
    const raceSkippedNames: string[] = []

    const results = await Promise.all(
      pendingEmployees.map(async (emp) => {
        const baseSalary = emp.baseSalary ?? 0

        // Proration for employees hired partway through this period. Deduction
        // sub-calculations below (late/absent/unpaid/SS/tax) deliberately keep
        // using the full nominal `baseSalary` unchanged — attendance/leave rows
        // simply don't exist before the hire date, so they're naturally unaffected,
        // and SS/tax already aren't adjusted for partial months even for absences
        // today. Only the starting base-salary figure is prorated.
        let periodBaseSalary = baseSalary
        let prorationNote: string | undefined
        if (emp.startDate && emp.startDate > startDate && emp.startDate <= endDate) {
          const totalDays = daysBetweenInclusive(startDate, endDate)
          const workedDays = daysBetweenInclusive(emp.startDate, endDate)
          periodBaseSalary = roundMoney(baseSalary * workedDays / totalDays)
          prorationNote = `Prorated: เริ่มงาน ${emp.startDate.toLocaleDateString('th-TH')} — ทำงาน ${workedDays}/${totalDays} วันของเดือนนี้`
        }

        const attendances = attendancesByUser.get(emp.id) ?? []
        const approvedLeaves = approvedLeavesByUser.get(emp.id) ?? []
        const unpaidLeaves = unpaidLeavesByUser.get(emp.id) ?? []

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
        const absentDeduction = roundMoney(
          absentDays * dailyRate + (absentRate > 0 ? absentDays * absentRate : 0),
        )
        const unpaidLeaveDeduction = roundMoney(unpaidDays * dailyRate)
        const earlyLeaveDeduction = roundMoney(earlyLeaveDays * dailyRate * 0.5)

        let ssDeduction = 0
        if (emp.socialSecurity && baseSalary > 0) {
          ssDeduction = roundMoney(Math.min(baseSalary * SS_RATE, SS_MAX))
        }

        const taxResult = computeMonthlyTax(baseSalary)
        const taxDeduction = taxResult.monthlyWithholding

        const netSalary = roundMoney(
          periodBaseSalary -
          lateDeduction -
          absentDeduction -
          unpaidLeaveDeduction -
          earlyLeaveDeduction -
          ssDeduction -
          taxDeduction,
        )

        const payload = {
          baseSalary: periodBaseSalary,
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
          ...(prorationNote ? { note: prorationNote } : {}),
        }

        // Re-check status inside the transaction, right before writing — closes
        // the window where someone approves this employee's payroll between the
        // `existingApproved` read at the top of this request and this write.
        return prisma.$transaction(async (tx) => {
          const current = await tx.payroll.findUnique({
            where: { userId_month_year: { userId: emp.id, month, year } },
            select: { status: true },
          })
          if (current?.status === 'APPROVED') {
            raceSkippedNames.push(emp.name)
            return null
          }
          return tx.payroll.upsert({
            where: { userId_month_year: { userId: emp.id, month, year } },
            update: payload,
            create: { userId: emp.id, month, year, ...payload },
          })
        })
      }),
    )

    const allSkippedNames = [
      ...skippedApproved.map((e) => e.name),
      ...raceSkippedNames,
    ]

    return NextResponse.json({
      success: true,
      count: results.filter(Boolean).length,
      skippedApproved: skippedApproved.map((e) => ({ userId: e.id, name: e.name })),
      ...(allSkippedNames.length > 0 && {
        message: `ข้าม ${allSkippedNames.length} รายการที่อนุมัติแล้ว (ไม่คำนวณทับ): ${allSkippedNames.join(', ')}`,
      }),
    })
  } catch (err) {
    return apiError(err)
  }
}
