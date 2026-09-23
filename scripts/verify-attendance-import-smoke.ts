/**
 * Live-DB smoke test for the Excel backdated-attendance import feature
 * (Phase 5 — final testing, per the 2026-09-22 approved plan). Follows
 * CLAUDE.md's live-DB rules: creates ONE throwaway user with an unambiguous
 * email/employeeId, never touches any real account, and deletes everything
 * it created (including any pre-existing "already has attendance" row IT
 * created) in a `finally` block.
 *
 * This exercises the REAL production functions end-to-end against the real
 * Turso DB:
 *   - lib/attendance-import-parse.ts   parseAttendanceImportWorkbook() on a
 *     REAL .xlsx buffer built with exceljs (not a mock)
 *   - lib/attendance-import-validate.ts validateAndComputeAttendanceImportRows()
 *     — real employee-code matching, real duplicate-date check, real
 *     computeCheckInLateness/computeCheckOutEarlyLeave, real
 *     computeLateDeduction (all against live data)
 *   - the exact same attendance.create() data shape + finalizeAttendanceRecord()
 *     call app/api/attendance/import/confirm/route.ts uses (copied verbatim
 *     from that file, since invoking the route handler itself would require
 *     a real NextAuth session — see the note before payroll-generate check
 *     below for the same constraint and how it's worked around)
 *   - the exact prisma.attendance.findMany() WHERE-shape and
 *     computeLateDeduction() call app/api/payroll/generate/route.ts uses,
 *     to prove an imported row is picked up identically to a real scan
 *
 * Scope note (disclosed explicitly, not hidden): this does NOT go through
 * HTTP + a real NextAuth session for either /api/attendance/import/confirm
 * or /api/payroll/generate — `auth()` reads next/headers()'s request-scoped
 * context, which doesn't exist in a bare script process. The 401/403 gates
 * on both routes are already covered by the existing mocked-prisma unit
 * tests (tests/api/attendance-import-*.test.ts). What this script proves
 * instead is that the real business-logic functions + real DB queries those
 * routes call produce correct, consistent results — which is the part no
 * amount of mocking can verify.
 *
 * Usage: npx tsx scripts/verify-attendance-import-smoke.ts
 */
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env') })

import ExcelJS from 'exceljs'
import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN
const prisma =
  url && token
    ? new PrismaClient({ adapter: new PrismaLibSQL({ url, authToken: token }) })
    : new PrismaClient()

const stamp = Date.now()
const tag = `script-verify-${stamp}`
const email = `${tag}-import@test.com`
const employeeCode = `SCRIPTIMPORT${stamp}`
const userName = `Script Verify Import ${stamp}`
const BASE_SALARY = 30000

let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`  OK   ${label}`)
  else { failed++; console.log(`  FAIL ${label}`, detail ?? '') }
}

async function main() {
  console.log(`\n=== attendance-import Phase 5 — live-DB smoke test (${tag}) ===\n`)

  const {
    formatDateDdMmYyyyBangkok,
    formatTimeBangkok,
    bangkokDateKey,
    startOfDayBangkok,
  } = await import('../lib/datetime-bangkok')
  const { getCachedCompanySettings } = await import('../lib/company-settings-cache')
  const { getHolidayForDate } = await import('../lib/company-holidays')
  const { parseAttendanceImportWorkbook } = await import('../lib/attendance-import-parse')
  const { validateAndComputeAttendanceImportRows } = await import('../lib/attendance-import-validate')
  const { getDayOfWeekIndex, finalizeAttendanceRecord } = await import('../lib/attendance-work-log')
  const { ATTENDANCE_COMPLETED_PATCH } = await import('../lib/attendance-flow')
  const { computeLateDeduction, lateRatePerMinute, roundMoney, buildApprovedLeaveDateSet } =
    await import('../lib/payroll-late-deduction')
  const { payrollPeriodRange } = await import('../lib/payroll-period')
  const { createAuditLog } = await import('../lib/notifications')

  const settings = await getCachedCompanySettings()
  if (!settings?.workStartTime || !settings.workEndTime) {
    throw new Error('CompanySettings.workStartTime/workEndTime not set — cannot build a deterministic late check-in for this smoke test')
  }
  const holidayRows = await prisma.companyHoliday.findMany({
    select: { id: true, holidayName: true, holidayDate: true, holidayType: true, repeatEveryYear: true, branchId: true },
  })

  // Pick 2 distinct backdated weekday-equivalent dates that are NOT company
  // holidays for this (branchless) user, walking backward from "3 days ago"
  // — avoids a coincidental Saturday/Sunday/holiday zeroing out the late
  // deduction we're deliberately trying to produce, or corrupting the
  // "already has attendance" duplicate-date check.
  function findCleanDate(startOffsetDays: number, avoid: Set<string>): Date {
    for (let i = 0; i < 30; i++) {
      const candidate = startOfDayBangkok(new Date(Date.now() - (startOffsetDays + i) * 86_400_000))
      const key = bangkokDateKey(candidate)
      if (avoid.has(key)) continue
      if (!getHolidayForDate(candidate, null, holidayRows)) return candidate
    }
    throw new Error('could not find a clean non-holiday date in 30 days — unexpected holiday density')
  }
  const dateA = findCleanDate(3, new Set())
  const dateB = findCleanDate(10, new Set([bangkokDateKey(dateA)]))
  const dateAKey = bangkokDateKey(dateA)
  const dateBKey = bangkokDateKey(dateB)
  console.log(`using dateA (to-create, deliberately late) = ${dateAKey}, dateB (pre-existing, expect skip) = ${dateBKey}`)

  // Deliberately-late check-in: workStartTime + grace + 22 minutes.
  const graceMin = settings.lateGraceMin ?? 5
  const baseDeadline = new Date(`${dateAKey}T${settings.workStartTime}:00+07:00`)
  const checkInA = new Date(baseDeadline.getTime() + (graceMin + 22) * 60_000)
  const workEnd = new Date(`${dateAKey}T${settings.workEndTime}:00+07:00`)
  const checkOutA = new Date(workEnd.getTime() + 30 * 60_000) // 30 min after work-end, avoids early-leave

  const user = await prisma.user.create({
    data: {
      email,
      employeeId: employeeCode,
      passwordHash: 'x',
      name: userName,
      role: 'EMPLOYEE',
      status: 'ACTIVE',
      baseSalary: BASE_SALARY,
    },
    select: { id: true, name: true, employeeId: true },
  })
  console.log(`created throwaway user id=${user.id} employeeId=${user.employeeId}`)

  let batchId: string | null = null
  const createdAttendanceIds: string[] = []
  let existingAttendanceId: string | null = null

  try {
    // Row B's "already has attendance" precondition — a normal-looking real
    // attendance row already in the system for dateB, same shape a real
    // check-in produces.
    const existing = await prisma.attendance.create({
      data: {
        ...ATTENDANCE_COMPLETED_PATCH,
        userId: user.id,
        date: dateB,
        sessionIndex: 1,
        checkIn: new Date(`${dateBKey}T${settings.workStartTime}:00+07:00`),
        checkOut: new Date(`${dateBKey}T${settings.workEndTime}:00+07:00`),
        status: 'NORMAL',
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        workMinutes: 480,
        dayOfWeek: getDayOfWeekIndex(dateB),
      },
      select: { id: true },
    })
    existingAttendanceId = existing.id
    console.log(`pre-created "already exists" attendance id=${existing.id} for dateB (simulates a real prior scan)`)

    // --- Build a REAL .xlsx buffer (exceljs), full export-shaped header row,
    // including the "never trust" columns filled with deliberately WRONG
    // values on row A, to prove they're ignored (Rule #1). ---
    const wb = new ExcelJS.Workbook()
    const sheet = wb.addWorksheet('Sheet1')
    sheet.addRow(['พนักงาน', 'วันที่', 'วัน', 'เช็คอิน', 'สถานที่เช็คอิน', 'เริ่มพัก', 'จบพัก', 'เช็คเอาท์', 'สถานที่เช็คเอาท์', 'มาสาย (นาที)', 'กลับก่อน (นาที)', 'ชั่วโมงทำงาน', 'สถานะ', 'ประเภทการลา', 'หมายเหตุ'])
    // Row 2 — valid, matches our test employee, deliberately late. Bogus
    // late/early/hours/status values that must be IGNORED and recomputed.
    sheet.addRow([
      `${userName} (${employeeCode})`, formatDateDdMmYyyyBangkok(dateA), '-',
      formatTimeBangkok(checkInA), '-', '-', '-', formatTimeBangkok(checkOutA), '-',
      '999', '999', '0.00', 'ABSENT', 'SICK', 'ค่าปลอมสำหรับทดสอบ — ต้องถูกเพิกเฉยทั้งหมด',
    ])
    // Row 3 — same employee, dateB, which already has attendance → must skip.
    sheet.addRow([
      `${userName} (${employeeCode})`, formatDateDdMmYyyyBangkok(dateB), '-',
      formatTimeBangkok(new Date(`${dateBKey}T09:00:00+07:00`)), '-', '-', '-',
      formatTimeBangkok(new Date(`${dateBKey}T17:00:00+07:00`)), '-', '-', '-', '-', '-', '-', '-',
    ])
    // Row 4 — unmatched employee code → must skip.
    sheet.addRow([
      `คนไม่มีตัวตน (NOPE-${stamp})`, formatDateDdMmYyyyBangkok(dateA), '-',
      '08:00', '-', '-', '-', '17:00', '-', '-', '-', '-', '-', '-', '-',
    ])
    const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer

    // --- Real parse (Phase 3) ---
    const parsed = await parseAttendanceImportWorkbook(buffer)
    check('parseAttendanceImportWorkbook returned ok:true', parsed.ok === true)
    if (!parsed.ok) throw new Error(parsed.headerError)
    check('parsed exactly 3 data rows', parsed.rows.length === 3, parsed.rows.length)
    check('row 2 (valid row) has zero parseErrors', parsed.rows[0]?.parseErrors.length === 0, parsed.rows[0]?.parseErrors)

    // --- Real validate+compute against live DB (Phase 3) ---
    const validated = await validateAndComputeAttendanceImportRows(parsed.rows)
    check('toCreate has exactly 1 row (only dateA/valid employee)', validated.toCreate.length === 1, validated.toCreate)
    check('skipped has exactly 2 rows', validated.skipped.length === 2, validated.skipped)

    const toCreateRow = validated.toCreate[0]
    check('toCreate row resolved to our throwaway user', toCreateRow?.userId === user.id, toCreateRow?.userId)
    check('toCreate row status is LATE (real formula, not the bogus "ABSENT" in the file)', toCreateRow?.status === 'LATE', toCreateRow?.status)
    check(`toCreate row lateMinutes is exactly ${22} (not the bogus "999" in the file)`, toCreateRow?.lateMinutes === 22, toCreateRow?.lateMinutes)
    check('toCreate row earlyLeaveMinutes is 0 (checked out after work-end)', toCreateRow?.earlyLeaveMinutes === 0, toCreateRow?.earlyLeaveMinutes)

    const skipDateB = validated.skipped.find((s) => s.reason.includes('มีข้อมูลลงเวลา'))
    check('dateB row was skipped with the "already has attendance" reason', !!skipDateB, validated.skipped)
    const skipUnmatched = validated.skipped.find((s) => s.reason.includes('ไม่พบพนักงาน'))
    check('unmatched-employee row was skipped with the "employee not found" reason', !!skipUnmatched, validated.skipped)

    const expectedRate = lateRatePerMinute(BASE_SALARY)
    const expectedDeduction = roundMoney(expectedRate * 22)
    const deductionRow = validated.estimatedDeductionByEmployee.find((e) => e.userId === user.id)
    check('estimatedDeductionByEmployee has an entry for our user', !!deductionRow, validated.estimatedDeductionByEmployee)
    check(
      `estimated deduction (${deductionRow?.estimatedDeduction}) matches manual formula calc (${expectedDeduction})`,
      deductionRow?.estimatedDeduction === expectedDeduction,
      { got: deductionRow?.estimatedDeduction, expected: expectedDeduction },
    )
    check('totalEstimatedDeduction matches the single employee\'s deduction', validated.totalEstimatedDeduction === expectedDeduction, validated.totalEstimatedDeduction)

    // --- Real write step — the EXACT data shape + finalize call
    // app/api/attendance/import/confirm/route.ts uses. ---
    const batch = await prisma.attendanceImportBatch.create({
      data: {
        uploadedById: user.id,
        fileName: 'smoke-test-import.xlsx',
        totalRows: validated.totalRows,
        createdCount: 0,
        skippedCount: 0,
        skippedRows: '[]',
      },
      select: { id: true },
    })
    batchId = batch.id
    console.log(`created AttendanceImportBatch id=${batch.id}`)

    const created = await prisma.attendance.create({
      data: {
        ...ATTENDANCE_COMPLETED_PATCH,
        userId: toCreateRow.userId,
        date: toCreateRow.date,
        sessionIndex: 1,
        checkIn: toCreateRow.checkIn,
        checkOut: toCreateRow.checkOut,
        lunchOut: toCreateRow.lunchOut,
        lunchIn: toCreateRow.lunchIn,
        lateMinutes: toCreateRow.lateMinutes,
        earlyLeaveMinutes: toCreateRow.earlyLeaveMinutes,
        workMinutes: toCreateRow.workMinutes,
        status: toCreateRow.status,
        dayOfWeek: getDayOfWeekIndex(toCreateRow.date),
        importBatchId: batch.id,
      },
      select: { id: true },
    })
    createdAttendanceIds.push(created.id)
    await finalizeAttendanceRecord(created.id)
    await prisma.attendanceImportBatch.update({
      where: { id: batch.id },
      data: { createdCount: 1, skippedCount: validated.skipped.length, skippedRows: JSON.stringify(validated.skipped) },
    })
    await createAuditLog({
      actorId: user.id,
      targetId: batch.id,
      targetType: 'AttendanceImportBatch',
      action: 'CREATE',
      after: { fileName: 'smoke-test-import.xlsx', totalRows: validated.totalRows, createdCount: 1, skippedCount: validated.skipped.length },
    })
    console.log(`created Attendance id=${created.id} + finalized + AuditLog written`)

    const stored = await prisma.attendance.findUnique({
      where: { id: created.id },
      select: {
        importBatchId: true, checkIn: true, checkOut: true, lateMinutes: true, earlyLeaveMinutes: true,
        workMinutes: true, status: true, approved: true, attendanceStatus: true, dayOfWeek: true,
      },
    })
    check('stored row importBatchId points at the batch we created', stored?.importBatchId === batch.id, stored?.importBatchId)
    check('stored row checkIn matches the computed value', stored?.checkIn?.getTime() === toCreateRow.checkIn?.getTime())
    check('stored row lateMinutes matches (22)', stored?.lateMinutes === 22, stored?.lateMinutes)
    check('stored row status is LATE', stored?.status === 'LATE', stored?.status)
    check('finalizeAttendanceRecord marked it approved+completed (same as a real scan)', stored?.approved === true && stored?.attendanceStatus === 'completed')

    const auditRows = await prisma.auditLog.findMany({ where: { targetId: batch.id, targetType: 'AttendanceImportBatch' } })
    check('exactly one AuditLog row for this batch', auditRows.length === 1, auditRows.length)

    // --- Payroll-generate integration check — same query WHERE-shape +
    // same computeLateDeduction() call app/api/payroll/generate/route.ts
    // uses (see file-level note re: why this isn't a real HTTP call). ---
    let month = dateA.getMonth() + 1
    let year = dateA.getFullYear()
    let period = payrollPeriodRange(month, year)
    if (!(dateA >= period.start && dateA <= period.end)) {
      month = month === 12 ? 1 : month + 1
      year = month === 1 ? year + 1 : year
      period = payrollPeriodRange(month, year)
    }
    check(`dateA falls inside the computed payroll period (${month}/${year})`, dateA >= period.start && dateA <= period.end, period)

    const payrollAttendances = await prisma.attendance.findMany({
      where: { userId: { in: [user.id] }, date: { gte: period.start, lte: period.end } },
      select: { userId: true, date: true, lateMinutes: true, status: true, earlyLeaveMinutes: true, workMinutes: true, leaveType: true, checkIn: true },
    })
    // dateB (the pre-existing row) may legitimately also fall inside the same
    // payroll period as dateA depending on how many days back "now" is in the
    // 21st-to-20th window — that's correct real behavior (payroll must
    // aggregate ALL attendance in the period, imported or not), so this only
    // asserts our imported row specifically is present, not that it's the
    // only row.
    const importedRowInPayrollQuery = payrollAttendances.find(
      (a) => a.userId === user.id && a.lateMinutes === 22 && a.status === 'LATE',
    )
    check('payroll-generate\'s own attendance query picks up our imported row (indistinguishable from a real scan)', !!importedRowInPayrollQuery, payrollAttendances)

    const approvedLeaves = await prisma.leaveRequest.findMany({
      where: { userId: { in: [user.id] }, status: { in: ['APPROVED', 'ADMIN_APPROVED'] }, startDate: { lte: period.end }, endDate: { gte: period.start } },
      select: { startDate: true, endDate: true, status: true },
    })
    const leaveDateKeys = buildApprovedLeaveDateSet(approvedLeaves, period.start, period.end)
    const payrollCalc = computeLateDeduction({
      baseSalary: BASE_SALARY,
      attendances: payrollAttendances,
      leaveDateKeys,
      holidays: holidayRows,
      branchId: null,
    })
    check(
      `payroll-generate's own computeLateDeduction() produces the SAME deduction (${payrollCalc.lateDeduction}) the import preview estimated (${expectedDeduction})`,
      payrollCalc.lateDeduction === expectedDeduction,
      { payrollCalc: payrollCalc.lateDeduction, previewEstimate: expectedDeduction },
    )
    check('payroll-generate calc also reports 1 late day', payrollCalc.lateDays === 1, payrollCalc.lateDays)

    console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`}\n`)
  } finally {
    console.log('\ncleaning up throwaway rows...')
    if (batchId) {
      await prisma.auditLog.deleteMany({ where: { targetId: batchId, targetType: 'AttendanceImportBatch' } })
    }
    await prisma.notification.deleteMany({ where: { userId: user.id } })
    await prisma.attendance.deleteMany({ where: { userId: user.id } })
    if (batchId) {
      await prisma.attendanceImportBatch.deleteMany({ where: { id: batchId } })
    }
    await prisma.user.deleteMany({ where: { id: user.id } })
    console.log(`cleanup done — deleted user=${user.id}, ${createdAttendanceIds.length + (existingAttendanceId ? 1 : 0)} attendance row(s), batch=${batchId ?? '(none)'}`)
  }

  if (failed > 0) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error('verification script crashed:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
