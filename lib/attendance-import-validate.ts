import type { AttendanceStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { bangkokDateKey } from '@/lib/datetime-bangkok'
import { getCachedCompanySettings } from '@/lib/company-settings-cache'
import { computeCheckInLateness, computeCheckOutEarlyLeave } from '@/lib/attendance-time-calc'
import { computeWorkMinutes } from '@/lib/attendance-work-log'
import {
  computeLateDeduction,
  buildApprovedLeaveDateSet,
  roundMoney,
} from '@/lib/payroll-late-deduction'
import type { HolidayRecord } from '@/lib/company-holidays'
import type { AttendanceImportRawRow } from '@/lib/attendance-import-parse'

/**
 * Excel backdated-attendance import — DB-touching validate/compute step.
 * Still entirely READ-ONLY (no attendance.create/update here at all — that's
 * the confirm+write step, a later phase). Every late/early/work-minutes
 * value is computed via the exact same functions a real face-scan check-in/
 * out uses (lib/attendance-time-calc.ts, lib/attendance-work-log.ts), per
 * the approved rule that the import must never trust numbers typed in the
 * spreadsheet. The late-deduction estimate reuses payroll generate's own
 * computeLateDeduction() so the preview HR sees is not a different formula
 * from what actually gets deducted later.
 *
 * Known limitation (accepted at plan approval): getCachedCompanySettings()
 * returns CURRENT settings, not whatever was in effect on the historical
 * date being imported — there is no historical settings snapshot anywhere
 * in this codebase to fall back to. If work hours changed significantly
 * since the imported dates, late/early classification for those old rows
 * uses today's cutoff times.
 */

export type AttendanceImportComputedRow = {
  rowNumber: number
  userId: string
  employeeName: string
  date: Date
  checkIn: Date | null
  checkOut: Date | null
  lunchOut: Date | null
  lunchIn: Date | null
  lateMinutes: number
  earlyLeaveMinutes: number
  workMinutes: number
  status: AttendanceStatus
}

export type AttendanceImportSkippedRow = {
  rowNumber: number
  employeeCell: string
  reason: string
}

export type AttendanceImportEmployeeDeductionEstimate = {
  userId: string
  employeeName: string
  lateDays: number
  billableLateMinutes: number
  estimatedDeduction: number
}

export type AttendanceImportValidationResult = {
  totalRows: number
  toCreate: AttendanceImportComputedRow[]
  skipped: AttendanceImportSkippedRow[]
  estimatedDeductionByEmployee: AttendanceImportEmployeeDeductionEstimate[]
  totalEstimatedDeduction: number
}

type EmployeeLookup = {
  id: string
  employeeId: string | null
  name: string
  baseSalary: number | null
  branchId: string | null
}

export async function validateAndComputeAttendanceImportRows(
  rawRows: AttendanceImportRawRow[],
): Promise<AttendanceImportValidationResult> {
  const skipped: AttendanceImportSkippedRow[] = []
  const structurallyValid: AttendanceImportRawRow[] = []

  for (const row of rawRows) {
    if (row.parseErrors.length > 0) {
      skipped.push({ rowNumber: row.rowNumber, employeeCell: row.employeeCell, reason: row.parseErrors.join('; ') })
      continue
    }
    structurallyValid.push(row)
  }

  // Rule: match employees by EMP code only, never by name (names can be
  // mistyped/duplicated — the code is authoritative) — batched, not one
  // query per row.
  const codes = [...new Set(structurallyValid.map((r) => r.employeeCode).filter((c): c is string => !!c))]
  const employees: EmployeeLookup[] = codes.length > 0
    ? await prisma.user.findMany({
        where: { employeeId: { in: codes } },
        select: { id: true, employeeId: true, name: true, baseSalary: true, branchId: true },
      })
    : []
  const employeeByCode = new Map(employees.filter((e) => e.employeeId).map((e) => [e.employeeId as string, e]))

  const withEmployee: { row: AttendanceImportRawRow; user: EmployeeLookup }[] = []
  for (const row of structurallyValid) {
    const user = row.employeeCode ? employeeByCode.get(row.employeeCode) : undefined
    if (!user) {
      skipped.push({
        rowNumber: row.rowNumber,
        employeeCell: row.employeeCell,
        reason: `ไม่พบพนักงานที่มีรหัส "${row.employeeCode}" ในระบบ`,
      })
      continue
    }
    withEmployee.push({ row, user })
  }

  // Rule: a date that already has attendance data in the system → skip that
  // row (existing data always wins). Also reject a second row for the same
  // employee+date WITHIN this same file — the DB unique constraint would
  // reject the second write anyway, better to report it here with a clear
  // reason than let it silently fail at write time.
  const userIds = [...new Set(withEmployee.map((x) => x.user.id))]
  const existingAttendance = userIds.length > 0
    ? await prisma.attendance.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, date: true },
      })
    : []
  const claimedKeys = new Set(existingAttendance.map((e) => `${e.userId}|${bangkokDateKey(e.date)}`))

  const forCompute: { row: AttendanceImportRawRow; user: EmployeeLookup }[] = []
  for (const item of withEmployee) {
    const key = `${item.user.id}|${bangkokDateKey(item.row.date!)}`
    if (claimedKeys.has(key)) {
      skipped.push({
        rowNumber: item.row.rowNumber,
        employeeCell: item.row.employeeCell,
        reason: `มีข้อมูลลงเวลาของวันที่ ${item.row.dateCell} อยู่แล้วในระบบ (หรือซ้ำกับอีกแถวในไฟล์นี้) — ข้ามแถวนี้ ถ้าต้องการทับข้อมูลเดิม กรุณาลบของเดิมออกก่อน`,
      })
      continue
    }
    claimedKeys.add(key)
    forCompute.push(item)
  }

  const settings = await getCachedCompanySettings()

  const toCreate: AttendanceImportComputedRow[] = forCompute.map(({ row, user }) => {
    const { lateMinutes, status: checkInStatus } = computeCheckInLateness({
      now: row.checkIn!,
      forceOutside: false,
      hasOutsideWorkApproval: false,
      settings,
    })
    let status: AttendanceStatus = checkInStatus
    let earlyLeaveMinutes = 0
    if (row.checkOut) {
      const result = computeCheckOutEarlyLeave({ now: row.checkOut, currentStatus: checkInStatus, settings })
      earlyLeaveMinutes = result.earlyLeaveMinutes
      status = result.status
    }
    const workMinutes = computeWorkMinutes({
      checkIn: row.checkIn, checkOut: row.checkOut, lunchOut: row.lunchOut, lunchIn: row.lunchIn,
    })

    return {
      rowNumber: row.rowNumber,
      userId: user.id,
      employeeName: user.name,
      date: row.date!,
      checkIn: row.checkIn,
      checkOut: row.checkOut,
      lunchOut: row.lunchOut,
      lunchIn: row.lunchIn,
      lateMinutes,
      earlyLeaveMinutes,
      workMinutes,
      status,
    }
  })

  // Estimated late-deduction preview — reuses payroll generate's own formula
  // (lib/payroll-late-deduction.ts) so the number HR sees here matches what
  // actually gets deducted later. This is an ESTIMATE only: the real payroll
  // generate run recomputes fresh against whatever period it runs for.
  const estimatedDeductionByEmployee: AttendanceImportEmployeeDeductionEstimate[] = []
  let totalEstimatedDeduction = 0

  if (toCreate.length > 0) {
    const dates = toCreate.map((r) => r.date.getTime())
    const rangeStart = new Date(Math.min(...dates))
    const rangeEnd = new Date(Math.max(...dates))
    const involvedUserIds = [...new Set(toCreate.map((r) => r.userId))]

    const [holidayRows, leaveRows] = await Promise.all([
      prisma.companyHoliday.findMany({
        select: { id: true, holidayName: true, holidayDate: true, holidayType: true, repeatEveryYear: true, branchId: true },
      }),
      prisma.leaveRequest.findMany({
        where: {
          userId: { in: involvedUserIds },
          status: { in: ['APPROVED', 'ADMIN_APPROVED'] },
          startDate: { lte: rangeEnd },
          endDate: { gte: rangeStart },
        },
        select: { userId: true, startDate: true, endDate: true, status: true },
      }),
    ])
    const holidays: HolidayRecord[] = holidayRows

    const leavesByUser = new Map<string, typeof leaveRows>()
    for (const l of leaveRows) {
      const list = leavesByUser.get(l.userId) ?? []
      list.push(l)
      leavesByUser.set(l.userId, list)
    }

    const rowsByUser = new Map<string, AttendanceImportComputedRow[]>()
    for (const r of toCreate) {
      const list = rowsByUser.get(r.userId) ?? []
      list.push(r)
      rowsByUser.set(r.userId, list)
    }

    for (const [userId, rows] of rowsByUser) {
      const user = employees.find((e) => e.id === userId)
      if (!user) continue
      const leaveDateKeys = buildApprovedLeaveDateSet(leavesByUser.get(userId) ?? [], rangeStart, rangeEnd)
      const calc = computeLateDeduction({
        baseSalary: user.baseSalary ?? 0,
        attendances: rows.map((r) => ({ date: r.date, lateMinutes: r.lateMinutes, status: r.status })),
        leaveDateKeys,
        holidays,
        branchId: user.branchId,
      })
      if (calc.lateDeduction > 0) {
        estimatedDeductionByEmployee.push({
          userId,
          employeeName: user.name,
          lateDays: calc.lateDays,
          billableLateMinutes: calc.billableLateMinutes,
          estimatedDeduction: calc.lateDeduction,
        })
        totalEstimatedDeduction += calc.lateDeduction
      }
    }
  }

  return {
    totalRows: rawRows.length,
    toCreate,
    skipped,
    estimatedDeductionByEmployee,
    totalEstimatedDeduction: roundMoney(totalEstimatedDeduction),
  }
}
