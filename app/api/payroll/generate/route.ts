import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { payrollPeriodKeys, payrollPeriodRange } from '@/lib/payroll-period'
import { payrollEligibleUserWhereForRange } from '@/lib/payroll-employee-scope'
import { buildBranchScope, branchUserWhere } from '@/lib/branch-scope'
import {
  buildApprovedLeaveDateSet,
  computeLateDeduction,
  serializeLateDeductionDetail,
  roundMoney,
} from '@/lib/payroll-late-deduction'
import {
  computeEarlyLeaveDeduction,
  computeMonthlyProration,
  dailyWageRate,
  leaveDaysWithinPeriod,
  perDayDeduction,
  perMinuteWageRate,
} from '@/lib/payroll-deductions'
import { ensurePayrollFormulasRound1 } from '@/lib/ensure-payroll-formulas-round1'
import { computeDaysWorked } from '@/lib/payroll-daily-wage'
import { computeDiligenceAllowance } from '@/lib/payroll-diligence'
import { computeSecurityDepositInstallment } from '@/lib/payroll-security-deposit'
import { computePayrollTotals } from '@/lib/payroll-totals'
import { countUnrecordedAbsenceDays } from '@/lib/payroll-unrecorded-absence'
import { bangkokDateKey } from '@/lib/datetime-bangkok'
import type { HolidayRecord } from '@/lib/company-holidays'
import { ensurePayrollPayslipColumns } from '@/lib/ensure-payroll-payslip-columns'
import { ensurePayrollFieldsBatch2 } from '@/lib/ensure-payroll-fields-batch-2'
import { ensurePayrollFieldsBatch3 } from '@/lib/ensure-payroll-fields-batch-3'

const GENERATE_ROLES = ['MANAGER_HR', 'ADMIN', 'CEO', 'SUPER_ADMIN', 'HR'] as const

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id || !(GENERATE_ROLES as readonly string[]).includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await ensurePayrollPayslipColumns()
    await ensurePayrollFieldsBatch2()
    await ensurePayrollFieldsBatch3()
    await ensurePayrollFormulasRound1()

    const { month, year, branchId: filterBranchId } = await req.json()
    if (!month || !year) {
      return NextResponse.json({ error: 'month and year required' }, { status: 400 })
    }

    const scope = buildBranchScope(
      { role: session.user.role, branchId: session.user.branchId },
      { branchId: filterBranchId },
    )

    // CompanySettings.absentDeductRate (ค่าปรับขาดงานเพิ่มต่อวัน) เลิกใช้แล้ว
    // (2026-10, fix/payroll-formulas-round1) — ขาดงานหักแค่ค่าแรงต่อวันเท่านั้น

    const { start: startDate, end: endDate } = payrollPeriodRange(month, year)
    const period = payrollPeriodKeys(month, year)

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

    // Also include employees deactivated during this exact payroll period
    // (21st of the previous month through the 20th of this one — see
    // lib/payroll-period.ts — NOT the calendar month), so an employee whose
    // account HR disables on their last working day still gets a payroll row
    // generated automatically instead of silently falling out of every future
    // run once their status leaves ACTIVE. User has no dedicated
    // "deactivatedAt" field (confirmed — no route ever writes one, and PATCH
    // /api/users/[id] doesn't audit-log status changes either), so
    // `updatedAt` is used only to decide WHICH disabled employees are
    // plausibly relevant to this period — not to prorate their pay (see the
    // per-employee note below for why).
    const employees = await prisma.user.findMany({
      where: branchUserWhere(scope, payrollEligibleUserWhereForRange(startDate, endDate)),
      select: {
        id: true, name: true, baseSalary: true, socialSecurity: true, branchId: true,
        startDate: true, status: true, updatedAt: true, payType: true, dailyRate: true,
        positionAllowance: true, diligenceAllowanceDefault: true, studentLoanDeduction: true,
        taxScheme: true, monthlyTaxOverride: true, lastWorkingDate: true,
      },
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

    const [allAttendances, allApprovedLeaves, allUnpaidLeaves, activeDepositPlans] = await Promise.all([
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
        select: { userId: true, startDate: true, endDate: true, status: true, type: true },
      }),
      prisma.leaveRequest.findMany({
        where: {
          userId: { in: pendingIds },
          type: 'UNPAID',
          status: { in: ['APPROVED', 'ADMIN_APPROVED'] },
          startDate: { lte: endDate },
          endDate: { gte: startDate },
        },
        // startDate/endDate (2026-10) — ใบลาคร่อม 2 รอบหักเฉพาะวันในรอบนี้
        // (leaveDaysWithinPeriod) ไม่ใช่ days ทั้งใบ
        select: { userId: true, days: true, startDate: true, endDate: true },
      }),
      // เงินประกัน 6 งวด — ดึงเฉพาะพนักงานที่มีแผน ACTIVE อยู่ (ส่วนใหญ่ไม่มี)
      prisma.securityDepositPlan.findMany({
        where: { userId: { in: pendingIds }, status: 'ACTIVE' },
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
    const depositPlanByUser = new Map<string, (typeof activeDepositPlans)[number]>()
    for (const p of activeDepositPlans) depositPlanByUser.set(p.userId, p)

    // (2026-10) งวดเงินประกันนับเฉพาะเดือนที่อนุมัติแล้ว — ถ้าเดือนก่อนของคนที่มี
    // แผนเงินประกันยังเป็น DRAFT อยู่ เลขงวดเดือนนี้อาจซ้ำกับเดือนก่อน (เตือนเท่านั้น)
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    const prevMonthDraftDepositUserIds = new Set(
      activeDepositPlans.length === 0
        ? []
        : (await prisma.payroll.findMany({
            where: {
              userId: { in: activeDepositPlans.map((p) => p.userId) },
              month: prevMonth,
              year: prevYear,
              status: 'DRAFT',
              deletedAt: null,
            },
            select: { userId: true },
          })).map((p) => p.userId),
    )

    /** จำนวนงวดเงินประกันที่หักไปแล้วก่อนหน้าเดือนนี้ (ไม่รวมเดือนนี้เอง) —
     * นับสดทุกครั้งจาก Payroll จริง ไม่ใช่ mutable counter (ดู
     * lib/payroll-security-deposit.ts) นับเฉพาะงวดที่อนุมัติแล้ว (APPROVED/SENT,
     * 2026-10) — DRAFT ที่ยังไม่อนุมัติไม่นับว่าหักไปแล้ว */
    async function countPriorSecurityDepositInstallments(userId: string): Promise<number> {
      return prisma.payroll.count({
        where: {
          userId,
          deletedAt: null,
          status: { in: ['APPROVED', 'SENT'] },
          securityDepositDeduction: { gt: 0 },
          OR: [{ year: { lt: year } }, { year, month: { lt: month } }],
        },
      })
    }

    // Employees whose payroll got APPROVED by someone else between the
    // `existingApproved` read above and this employee's write below — caught
    // by the fresh in-transaction status re-check just before the upsert.
    const raceSkippedNames: string[] = []
    // Employees whose payroll for this key was soft-deleted (legally retained,
    // cancelled) — the upsert must never silently resurrect it by overwriting
    // deletedAt-still-set data with fresh DRAFT numbers.
    const deletedSkippedNames: string[] = []
    // Employees whose deductions this period exceeded what they were owed —
    // computePayrollTotals() already clamps netSalary at 0 (2026-09-30 fix),
    // this just collects who it happened to for a response-level warning.
    const negativeNetClampedNames: string[] = []

    type PendingEmployee = (typeof pendingEmployees)[number]
    type AttendanceRow = (typeof allAttendances)[number]
    type ApprovedLeaveRow = (typeof allApprovedLeaves)[number]
    type UnpaidLeaveRow = (typeof allUnpaidLeaves)[number]

    // Payroll fields batch 2/3 (2026-09) — fields this generate step computes
    // itself every time (deterministic from User/attendance/security-deposit
    // plan, safe to recompute on regenerate) vs. fields only ever written by
    // HR through PATCH /api/payroll/[id] (backPay/commission/professionalFee*/
    // overtimePay/bonus — generate must NEVER overwrite these on regenerate,
    // only read their current value to fold into this month's tax/SS/net calc;
    // see the preservedManual read right before buildMonthlyPayload/
    // buildDailyPayload is called inside the per-employee transaction below).
    type ComputedExtraFields = {
      positionAllowance: number
      studentLoanDeduction: number
      securityDepositDeduction: number
      securityDepositInstallmentNo: number | null
    }
    type PreservedManualFields = {
      backPay: number
      commission: number
      professionalFee: number
      professionalFeeTax: number
      overtimePay: number
      bonus: number
    }

    // ข้อความเตือนแดงระดับแถว (Payroll.criticalWarning) — HR ต้องตรวจก่อนอนุมัติ
    // (2026-10) รวมกับเตือนกรณีหักเกินเงินเดือน (negative clamp) เดิม
    const missingStartDateNames: string[] = []
    const missingLastWorkingDateNames: string[] = []
    const depositDraftNames: string[] = []
    const highSalaryNames: string[] = []
    const HIGH_BASE_SALARY_WARNING = 500_000
    function rowWarnings(emp: PendingEmployee, opts: { checkStartDate: boolean }): string[] {
      const warnings: string[] = []
      if (emp.payType !== 'DAILY' && (emp.baseSalary ?? 0) > HIGH_BASE_SALARY_WARNING) {
        highSalaryNames.push(emp.name)
        warnings.push(`⚠️ เงินเดือนฐาน ฿${(emp.baseSalary ?? 0).toLocaleString('th-TH')} เกิน ฿500,000 — อาจกรอกผิด กรุณาตรวจสอบก่อนอนุมัติ`)
      }
      if (prevMonthDraftDepositUserIds.has(emp.id)) {
        depositDraftNames.push(emp.name)
        warnings.push(`⚠️ payroll เดือนก่อน (${prevMonth}/${prevYear}) ยังเป็นร่าง — เลขงวดเงินประกันเดือนนี้อาจซ้ำกับเดือนก่อน กรุณาอนุมัติเดือนก่อนแล้วคำนวณใหม่`)
      }
      if (opts.checkStartDate && !emp.startDate) {
        missingStartDateNames.push(emp.name)
        warnings.push('⚠️ ยังไม่ได้กรอกวันเริ่มงาน — คำนวณเป็นเงินเดือนเต็มรอบ กรุณากรอกวันเริ่มงานและตรวจสอบก่อนอนุมัติ')
      }
      if (emp.status === 'DISABLED' && !emp.lastWorkingDate) {
        missingLastWorkingDateNames.push(emp.name)
        warnings.push('⚠️ บัญชีถูกปิดใช้งานแต่ยังไม่ได้กรอกวันทำงานวันสุดท้าย — ยังไม่ prorate กรุณากรอกวันทำงานวันสุดท้ายแล้วคำนวณใหม่ก่อนอนุมัติ')
      }
      return warnings
    }
    // ยอดหักรวมมากกว่ารายได้รวม (= net ติดลบก่อน clamp) — เตือนในแถวนั้นพร้อมตัวเลขทั้งสองฝั่ง
    function clampWarning(emp: PendingEmployee, totals: { negativeClampAmount: number; totalIncome: number; totalDeductions: number }): string[] {
      const { negativeClampAmount, totalIncome, totalDeductions } = totals
      if (negativeClampAmount <= 0) return []
      negativeNetClampedNames.push(`${emp.name} (เกิน ${negativeClampAmount.toLocaleString('th-TH')} บาท)`)
      return [
        `⚠️ ยอดหักรวม ฿${totalDeductions.toLocaleString('th-TH')} มากกว่ารายได้รวม ฿${totalIncome.toLocaleString('th-TH')} — ` +
        `หักเกินเงินเดือนที่พึงได้รับในงวดนี้ ${negativeClampAmount.toLocaleString('th-TH')} บาท ปรับเป็น 0 แล้ว กรุณาตรวจสอบก่อนอนุมัติ`,
      ]
    }

    // MONTHLY (2026-10, fix/payroll-formulas-round1 — สูตรใน lib/payroll-deductions.ts):
    // - ค่าแรงต่อวัน = เงินเดือนเต็ม ÷ 30, ต่อนาที = ÷ 8 ÷ 60 (เลิกใช้ ÷ 26 และ
    //   เลิกใช้ยอดหลัง prorate เป็นฐานหัก)
    // - ขาดงาน/ลาไม่รับเงิน หักวันละค่าแรงต่อวัน (ไม่มีค่าปรับขาดงานเพิ่มแล้ว)
    //   ลาไม่รับเงินนับเฉพาะวันในรอบนี้
    // - มาสาย/กลับก่อน หักค่าแรงต่อนาที × นาทีจริง ปัดทีละวัน (เลิกหักกลับก่อนครึ่งวัน)
    // - Prorate เข้าใหม่/ลาออกกลางรอบ: เงินเดือน − ค่าแรงต่อวัน × วันในรอบที่ไม่ได้
    //   ทำงาน (ก่อนวันเริ่มงาน/หลังวันทำงานวันสุดท้าย) และยอดนี้เป็นฐานเดียวของ
    //   SS/ภาษี/net (computePayrollTotals)
    function buildMonthlyPayload(
      emp: PendingEmployee,
      attendances: AttendanceRow[],
      approvedLeaves: ApprovedLeaveRow[],
      unpaidLeaves: UnpaidLeaveRow[],
      extra: ComputedExtraFields,
      preservedManual: PreservedManualFields,
    ) {
      const baseSalary = emp.baseSalary ?? 0
      const proration = computeMonthlyProration({
        baseSalary,
        period,
        startDate: emp.startDate,
        lastWorkingDate: emp.lastWorkingDate,
      })
      const periodBaseSalary = proration.amount
      const dailyRate = dailyWageRate({ payType: 'MONTHLY', baseSalary, dailyRate: null })

      const noteParts: string[] = []
      if (proration.prorated) {
        const parts: string[] = []
        if (proration.daysBeforeStart > 0) parts.push(`ก่อนวันเริ่มงาน ${proration.daysBeforeStart} วัน`)
        if (proration.daysAfterLastWorking > 0) parts.push(`หลังวันทำงานวันสุดท้าย ${proration.daysAfterLastWorking} วัน`)
        noteParts.push(
          `Prorated: ${parts.join(' + ')} — ฿${baseSalary.toLocaleString('th-TH')} − ค่าแรงวันละ ฿${roundMoney(dailyRate).toLocaleString('th-TH')} × ${proration.daysBeforeStart + proration.daysAfterLastWorking} วัน`,
        )
      }

      const leaveDateKeys = buildApprovedLeaveDateSet(approvedLeaves, startDate, endDate)

      const late = computeLateDeduction({
        baseSalary,
        attendances,
        leaveDateKeys,
        holidays,
        branchId: emp.branchId,
      })
      const early = computeEarlyLeaveDeduction({
        ratePerMinute: perMinuteWageRate(dailyRate),
        attendances,
        leaveDateKeys,
        holidays,
        branchId: emp.branchId,
      })

      // Explicit ABSENT-status rows (nothing in the codebase writes this
      // automatically — it only ever comes from a manual HR override) plus
      // days with NO Attendance row at all and no approved leave covering
      // them (2026-09-30 fix). The two counts are mutually exclusive by
      // construction, so this is a straight sum, never a double-count.
      // Counted for ACTIVE employees, and for DISABLED ones only once HR has
      // entered lastWorkingDate (2026-10) — that's the reliable upper bound
      // that was missing before; without it, guessing still risks docking
      // pay from someone who already left.
      const explicitAbsentDays = attendances.filter((a) => a.status === 'ABSENT').length
      const unrecordedAbsentDays = emp.status === 'ACTIVE' || emp.lastWorkingDate
        ? countUnrecordedAbsenceDays({
            periodStart: startDate,
            periodEnd: endDate,
            today: new Date(),
            attendanceDateKeys: new Set(attendances.map((a) => bangkokDateKey(a.date))),
            leaveDateKeys,
            holidays,
            branchId: emp.branchId,
            employeeStartDate: emp.startDate,
            employeeLastWorkingDate: emp.lastWorkingDate,
          })
        : 0
      const absentDays = explicitAbsentDays + unrecordedAbsentDays
      const unpaidDays = leaveDaysWithinPeriod(unpaidLeaves, period)

      // เบี้ยขยัน (ยืนยัน 2026-09) — ตัดทั้งจำนวนถ้ามีสาย/ขาด หรือมีวันลาที่ไม่ใช่
      // ลาพักร้อน; ใช้ late.lateDays/absentDays ที่คำนวณไว้แล้วข้างบนนี้เอง
      const diligence = computeDiligenceAllowance(emp.diligenceAllowanceDefault, {
        lateDays: late.lateDays,
        absentDays,
        approvedLeaves,
      })

      const lateDeduction = late.lateDeduction
      const absentDeduction = perDayDeduction(dailyRate, absentDays)
      const unpaidLeaveDeduction = perDayDeduction(dailyRate, unpaidDays)
      const earlyLeaveDeduction = early.earlyLeaveDeduction

      const totals = computePayrollTotals({
        baseSalary: periodBaseSalary,
        positionAllowance: extra.positionAllowance,
        diligenceAllowance: diligence.amount,
        backPay: preservedManual.backPay,
        commission: preservedManual.commission,
        overtimePay: preservedManual.overtimePay,
        bonus: preservedManual.bonus,
        professionalFee: preservedManual.professionalFee,
        professionalFeeTax: preservedManual.professionalFeeTax,
        studentLoanDeduction: extra.studentLoanDeduction,
        securityDepositDeduction: extra.securityDepositDeduction,
        lateDeduction,
        absentDeduction,
        unpaidLeaveDeduction,
        earlyLeaveDeduction,
        taxScheme: emp.taxScheme,
        socialSecurityEnabled: emp.socialSecurity,
        monthlyTaxOverride: emp.monthlyTaxOverride,
      })

      // criticalWarning is a SEPARATE column from note (2026-09-30 fix — see
      // prisma/schema.prisma's comment on Payroll.criticalWarning). Always
      // written (null when clean) so a stale warning from a prior run can
      // never linger once a regenerate's fresh numbers no longer warrant it.
      const warnings = [
        ...rowWarnings(emp, { checkStartDate: true }),
        ...clampWarning(emp, totals),
      ]

      return {
        baseSalary: periodBaseSalary,
        lateDeduction,
        absentDeduction,
        unpaidLeave: unpaidLeaveDeduction,
        earlyLeaveDeduction,
        socialSecurity: totals.socialSecurity,
        taxDeduction: totals.taxDeduction,
        taxDetail: totals.taxDetail,
        netSalary: totals.netSalary,
        lateDays: late.lateDays,
        absentDays,
        lateMinutes: late.billableLateMinutes,
        lateBillableMinutes: late.billableLateMinutes,
        lateDeductionDetail: serializeLateDeductionDetail(late.lines),
        payType: 'MONTHLY',
        taxScheme: emp.taxScheme,
        daysWorked: null,
        dailyRateUsed: null,
        positionAllowance: extra.positionAllowance,
        diligenceAllowance: diligence.amount,
        studentLoanDeduction: extra.studentLoanDeduction,
        securityDepositDeduction: extra.securityDepositDeduction,
        securityDepositInstallmentNo: extra.securityDepositInstallmentNo,
        status: 'DRAFT',
        // always written (null when nothing to say) so a stale proration note
        // never lingers after HR fixes startDate/lastWorkingDate and regenerates
        note: noteParts.length > 0 ? noteParts.join(' | ') : null,
        criticalWarning: warnings.length > 0 ? warnings.join(' | ') : null,
      }
    }

    // POLICY #3 (ยืนยัน 2026-10-07 — ห้ามเปลี่ยนโดยไม่ถามผู้ใช้, ดู CLAUDE.md § Payroll
    // policy): รายวันจ่ายเฉพาะวันที่มาทำงาน, SS คิดจากค่าจ้างที่ได้จริง (periodEarnings)
    // DAILY/INTERN — pay = days actually worked × dailyRate. No absent/
    // unpaid-leave deduction (a day not worked simply isn't paid). No holiday
    // pay for days not attended, including public/company holidays — a
    // deliberate policy decision (confirmed 2026-09; the company accepts the
    // labor-law tradeoff on ม.29's paid-traditional-holiday requirement).
    // มาสาย/กลับก่อน (2026-10): หักค่าแรงต่อนาที (ค่าแรงรายวัน ÷ 8 ÷ 60) × นาที
    // จริง ปัดทีละวัน ไม่หักวันลาอนุมัติ/วันหยุด — สูตรเดียวกับรายเดือน
    // SS/tax reuse the exact same formulas as MONTHLY, fed this period's
    // actual earnings (daysWorked × dailyRate).
    //
    // NOTE (assumption, flagged 2026-09): positionAllowance/diligenceAllowance/
    // studentLoanDeduction/securityDeposit are User-level snapshots that apply
    // regardless of payType. The diligence-cut check keeps using simple
    // status counts (unchanged behavior).
    function buildDailyPayload(
      emp: PendingEmployee,
      attendances: AttendanceRow[],
      approvedLeaves: ApprovedLeaveRow[],
      extra: ComputedExtraFields,
      preservedManual: PreservedManualFields,
    ) {
      const dailyRateUsed = emp.dailyRate ?? 0
      const daysWorked = computeDaysWorked(attendances)
      const periodEarnings = roundMoney(daysWorked * dailyRateUsed)
      const ratePerMinute = perMinuteWageRate(dailyWageRate({ payType: 'DAILY', baseSalary: null, dailyRate: dailyRateUsed }))

      const leaveDateKeys = buildApprovedLeaveDateSet(approvedLeaves, startDate, endDate)
      const late = computeLateDeduction({
        baseSalary: 0,
        ratePerMinute,
        attendances,
        leaveDateKeys,
        holidays,
        branchId: emp.branchId,
      })
      const early = computeEarlyLeaveDeduction({
        ratePerMinute,
        attendances,
        leaveDateKeys,
        holidays,
        branchId: emp.branchId,
      })

      // เบี้ยขยัน — นับ late/absent แบบง่ายจาก status ตรงๆ เหมือนเดิม
      const dailyLateDays = attendances.filter(
        (a) => a.status === 'LATE' || (a.lateMinutes ?? 0) > 0,
      ).length
      const dailyAbsentDays = attendances.filter((a) => a.status === 'ABSENT').length
      const diligence = computeDiligenceAllowance(emp.diligenceAllowanceDefault, {
        lateDays: dailyLateDays,
        absentDays: dailyAbsentDays,
        approvedLeaves,
      })

      const totals = computePayrollTotals({
        baseSalary: periodEarnings,
        positionAllowance: extra.positionAllowance,
        diligenceAllowance: diligence.amount,
        backPay: preservedManual.backPay,
        commission: preservedManual.commission,
        overtimePay: preservedManual.overtimePay,
        bonus: preservedManual.bonus,
        professionalFee: preservedManual.professionalFee,
        professionalFeeTax: preservedManual.professionalFeeTax,
        studentLoanDeduction: extra.studentLoanDeduction,
        securityDepositDeduction: extra.securityDepositDeduction,
        lateDeduction: late.lateDeduction,
        absentDeduction: 0,
        unpaidLeaveDeduction: 0,
        earlyLeaveDeduction: early.earlyLeaveDeduction,
        taxScheme: emp.taxScheme,
        socialSecurityEnabled: emp.socialSecurity,
        monthlyTaxOverride: emp.monthlyTaxOverride,
      })

      const warnings = [
        ...rowWarnings(emp, { checkStartDate: false }),
        ...clampWarning(emp, totals),
      ]

      return {
        baseSalary: periodEarnings,
        lateDeduction: late.lateDeduction,
        absentDeduction: 0,
        unpaidLeave: 0,
        earlyLeaveDeduction: early.earlyLeaveDeduction,
        socialSecurity: totals.socialSecurity,
        taxDeduction: totals.taxDeduction,
        taxDetail: totals.taxDetail,
        netSalary: totals.netSalary,
        lateDays: late.lateDays,
        absentDays: 0,
        lateMinutes: late.billableLateMinutes,
        lateBillableMinutes: late.billableLateMinutes,
        lateDeductionDetail: serializeLateDeductionDetail(late.lines),
        positionAllowance: extra.positionAllowance,
        diligenceAllowance: diligence.amount,
        studentLoanDeduction: extra.studentLoanDeduction,
        securityDepositDeduction: extra.securityDepositDeduction,
        securityDepositInstallmentNo: extra.securityDepositInstallmentNo,
        payType: 'DAILY',
        taxScheme: emp.taxScheme,
        daysWorked,
        dailyRateUsed,
        status: 'DRAFT',
        note: null,
        criticalWarning: warnings.length > 0 ? warnings.join(' | ') : null,
      }
    }

    const results = await Promise.all(
      pendingEmployees.map(async (emp) => {
        const attendances = attendancesByUser.get(emp.id) ?? []
        const approvedLeaves = approvedLeavesByUser.get(emp.id) ?? []
        const unpaidLeaves = unpaidLeavesByUser.get(emp.id) ?? []

        const plan = depositPlanByUser.get(emp.id) ?? null
        const priorInstallments = plan ? await countPriorSecurityDepositInstallments(emp.id) : 0
        const depositResult = computeSecurityDepositInstallment(plan, priorInstallments)

        const extra: ComputedExtraFields = {
          positionAllowance: emp.positionAllowance ?? 0,
          studentLoanDeduction: emp.studentLoanDeduction ?? 0,
          securityDepositDeduction: depositResult.amount,
          securityDepositInstallmentNo: depositResult.installmentNo,
        }

        // Re-check status inside the transaction, right before writing — closes
        // the window where someone approves this employee's payroll between the
        // `existingApproved` read at the top of this request and this write.
        // Also reads backPay/commission/professionalFee* here (manual-only
        // fields HR enters via PATCH /api/payroll/[id]) so a regenerate can
        // fold them into this month's SS/tax/net calc WITHOUT the upsert's
        // `update` data ever containing — and therefore ever overwriting —
        // those keys. See ComputedExtraFields/PreservedManualFields comment
        // above buildMonthlyPayload for the full rationale.
        return prisma.$transaction(async (tx) => {
          const current = await tx.payroll.findUnique({
            where: { userId_month_year: { userId: emp.id, month, year } },
            select: {
              status: true, deletedAt: true,
              backPay: true, commission: true, professionalFee: true, professionalFeeTax: true,
              overtimePay: true, bonus: true,
            },
          })
          if (current?.deletedAt) {
            deletedSkippedNames.push(emp.name)
            return null
          }
          if (current?.status === 'APPROVED') {
            raceSkippedNames.push(emp.name)
            return null
          }

          const preservedManual: PreservedManualFields = {
            backPay: current?.backPay ?? 0,
            commission: current?.commission ?? 0,
            professionalFee: current?.professionalFee ?? 0,
            professionalFeeTax: current?.professionalFeeTax ?? 0,
            overtimePay: current?.overtimePay ?? 0,
            bonus: current?.bonus ?? 0,
          }

          const payload =
            emp.payType === 'DAILY'
              ? buildDailyPayload(emp, attendances, approvedLeaves, extra, preservedManual)
              : buildMonthlyPayload(emp, attendances, approvedLeaves, unpaidLeaves, extra, preservedManual)

          // payload ไม่มี key backPay/commission/professionalFee/professionalFeeTax/
          // overtimePay/bonus เลย (ดู buildMonthlyPayload/buildDailyPayload) —
          // ตอน update จึงไม่เขียนทับ, ตอน create ปล่อยให้ schema @default(0) ทำหน้าที่แทน
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

    const disabledIncluded = pendingEmployees.filter((e) => e.status === 'DISABLED')
    // (2026-10) คนที่ปิดบัญชีแล้วและกรอก lastWorkingDate แล้วถูก prorate อัตโนมัติ
    // จึงไม่ต้องเตือน — เตือนเฉพาะคนที่ยังไม่ได้กรอก (ยังจ่ายเต็มรอบ/ยังไม่ตัดวัน)
    const disabledWarningParts: string[] = []
    if (missingLastWorkingDateNames.length > 0) {
      disabledWarningParts.push(
        `⚠️ รวม ${missingLastWorkingDateNames.length} พนักงานที่ปิดบัญชีแล้วแต่ยังไม่ได้กรอกวันทำงานวันสุดท้าย (ยังไม่ prorate) ` +
        `กรุณากรอกแล้วคำนวณใหม่ก่อนอนุมัติ: ${missingLastWorkingDateNames.join(', ')}`,
      )
    }

    return NextResponse.json({
      success: true,
      count: results.filter(Boolean).length,
      skippedApproved: skippedApproved.map((e) => ({ userId: e.id, name: e.name })),
      disabledIncluded: disabledIncluded.map((e) => ({ userId: e.id, name: e.name })),
      ...(allSkippedNames.length > 0 && {
        message: `ข้าม ${allSkippedNames.length} รายการที่อนุมัติแล้ว (ไม่คำนวณทับ): ${allSkippedNames.join(', ')}`,
      }),
      ...(deletedSkippedNames.length > 0 && {
        deletedSkipped: deletedSkippedNames,
        deletedWarning: `ต้องกู้คืนก่อนถึงจะคำนวณใหม่ได้ — ${deletedSkippedNames.length} รายการถูกลบไปแล้ว: ${deletedSkippedNames.join(', ')}`,
      }),
      ...(disabledWarningParts.length > 0 && {
        disabledWarning: disabledWarningParts.join(' | '),
      }),
      ...(depositDraftNames.length > 0 && {
        securityDepositDraftWarning:
          `⚠️ รวม ${depositDraftNames.length} พนักงานที่มีเงินประกันแต่ payroll เดือนก่อนยังเป็นร่าง — เลขงวดอาจซ้ำ ` +
          `กรุณาอนุมัติเดือนก่อนแล้วคำนวณใหม่: ${depositDraftNames.join(', ')}`,
      }),
      ...(highSalaryNames.length > 0 && {
        highBaseSalaryWarning:
          `⚠️ รวม ${highSalaryNames.length} พนักงานที่เงินเดือนฐานเกิน ฿500,000 (อาจกรอกผิด) กรุณาตรวจสอบ: ${highSalaryNames.join(', ')}`,
      }),
      ...(missingStartDateNames.length > 0 && {
        missingStartDateWarning:
          `⚠️ รวม ${missingStartDateNames.length} พนักงานรายเดือนที่ยังไม่ได้กรอกวันเริ่มงาน (คำนวณเต็มรอบ) ` +
          `กรุณาตรวจสอบก่อนอนุมัติ: ${missingStartDateNames.join(', ')}`,
      }),
      ...(negativeNetClampedNames.length > 0 && {
        negativeNetSalaryWarning:
          `⚠️ รวม ${negativeNetClampedNames.length} รายการที่หักเกินเงินเดือนที่พึงได้รับในงวดนี้ (ปรับเป็น 0 แล้ว) ` +
          `กรุณาตรวจสอบก่อนอนุมัติ: ${negativeNetClampedNames.join(', ')}`,
      }),
    })
  } catch (err) {
    return apiError(err)
  }
}
