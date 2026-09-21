import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { payrollPeriodRange } from '@/lib/payroll-period'
import { buildBranchScope, branchUserWhere } from '@/lib/branch-scope'
import {
  buildApprovedLeaveDateSet,
  computeLateDeduction,
  serializeLateDeductionDetail,
  roundMoney,
} from '@/lib/payroll-late-deduction'
import { computeDaysWorked } from '@/lib/payroll-daily-wage'
import { computeDiligenceAllowance } from '@/lib/payroll-diligence'
import { computeSecurityDepositInstallment } from '@/lib/payroll-security-deposit'
import { computePayrollTotals } from '@/lib/payroll-totals'
import type { HolidayRecord } from '@/lib/company-holidays'
import { ensurePayrollPayslipColumns } from '@/lib/ensure-payroll-payslip-columns'
import { ensurePayrollFieldsBatch2 } from '@/lib/ensure-payroll-fields-batch-2'
import { ensurePayrollFieldsBatch3 } from '@/lib/ensure-payroll-fields-batch-3'

const PAYROLL_ROLES = ['EMPLOYEE', 'MANAGER_HR', 'LAWYER'] as const

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

    await ensurePayrollPayslipColumns()
    await ensurePayrollFieldsBatch2()
    await ensurePayrollFieldsBatch3()

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

    const { start: startDate, end: endDate } = payrollPeriodRange(month, year)

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
      where: branchUserWhere(scope, {
        role: { in: [...PAYROLL_ROLES] },
        OR: [
          { status: 'ACTIVE' },
          { status: 'DISABLED', updatedAt: { gte: startDate, lte: endDate } },
        ],
      }),
      select: {
        id: true, name: true, baseSalary: true, socialSecurity: true, branchId: true,
        startDate: true, status: true, updatedAt: true, payType: true, dailyRate: true,
        positionAllowance: true, diligenceAllowanceDefault: true, studentLoanDeduction: true,
        taxScheme: true,
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
        select: { userId: true, days: true },
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

    /** จำนวนงวดเงินประกันที่หักไปแล้วก่อนหน้าเดือนนี้ (ไม่รวมเดือนนี้เอง) —
     * นับสดทุกครั้งจาก Payroll จริง ไม่ใช่ mutable counter (ดู
     * lib/payroll-security-deposit.ts) */
    async function countPriorSecurityDepositInstallments(userId: string): Promise<number> {
      return prisma.payroll.count({
        where: {
          userId,
          deletedAt: null,
          status: { not: 'REJECTED' },
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

    // Unchanged from before payType existed — every MONTHLY employee (the
    // default, and the only formula that existed until now) gets exactly the
    // same numbers as before this feature. Closures over startDate/endDate/
    // holidays/absentRate from the outer scope, same as the original inline
    // per-employee code this was extracted from.
    function buildMonthlyPayload(
      emp: PendingEmployee,
      attendances: AttendanceRow[],
      approvedLeaves: ApprovedLeaveRow[],
      unpaidLeaves: UnpaidLeaveRow[],
      extra: ComputedExtraFields,
      preservedManual: PreservedManualFields,
    ) {
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

      // Deactivated this month (see the query comment above for why there's
      // no reliable last-working-day to prorate against) — include at the
      // FULL nominal amount rather than guess, and flag loudly so HR checks
      // and adjusts the number down before approving instead of it silently
      // paying out a full month for a partial one.
      if (emp.status === 'DISABLED') {
        const disabledNote =
          `⚠️ บัญชีถูกปิดใช้งานในเดือนนี้ (แก้ไขล่าสุด ${emp.updatedAt.toLocaleDateString('th-TH')}) ` +
          `— ระบบไม่ทราบวันทำงานสุดท้ายที่แน่นอน จึงคำนวณเป็นเงินเดือนเต็มจำนวน กรุณาตรวจสอบและปรับยอดก่อนอนุมัติ`
        prorationNote = prorationNote ? `${prorationNote} | ${disabledNote}` : disabledNote
      }

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

      // เบี้ยขยัน (ยืนยัน 2026-09) — ตัดทั้งจำนวนถ้ามีสาย/ขาด หรือมีวันลาที่ไม่ใช่
      // ลาพักร้อน; ใช้ late.lateDays/absentDays ที่คำนวณไว้แล้วข้างบนนี้เอง
      const diligence = computeDiligenceAllowance(emp.diligenceAllowanceDefault, {
        lateDays: late.lateDays,
        absentDays,
        approvedLeaves,
      })

      const dailyRate = baseSalary / 26
      const lateDeduction = late.lateDeduction
      const absentDeduction = roundMoney(
        absentDays * dailyRate + (absentRate > 0 ? absentDays * absentRate : 0),
      )
      const unpaidLeaveDeduction = roundMoney(unpaidDays * dailyRate)
      const earlyLeaveDeduction = roundMoney(earlyLeaveDays * dailyRate * 0.5)

      // ฐาน SS/ภาษี ใช้ baseSalary เต็มจำนวน (ไม่ prorate) — พฤติกรรมเดิมของ
      // ระบบที่ไม่ปรับ SS/ภาษีตามสัดส่วนวันทำงานแม้เดือนนี้ prorate; netSalary
      // ใช้ periodBaseSalary (prorate แล้ว) เป็นตัวจ่ายจริง — ดู
      // lib/payroll-totals.ts สำหรับเหตุผลที่แยก 2 ค่านี้
      const totals = computePayrollTotals({
        taxSsBaseSalary: baseSalary,
        payoutBaseSalary: periodBaseSalary,
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
      })
      const ssDeduction = totals.socialSecurity
      const taxDeduction = totals.taxDeduction
      const taxDetailJson = totals.taxDetail
      const netSalary = totals.netSalary

      return {
        baseSalary: periodBaseSalary,
        lateDeduction,
        absentDeduction,
        unpaidLeave: unpaidLeaveDeduction,
        earlyLeaveDeduction,
        socialSecurity: ssDeduction,
        taxDeduction,
        taxDetail: taxDetailJson,
        netSalary,
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
        ...(prorationNote ? { note: prorationNote } : {}),
      }
    }

    // DAILY/INTERN — pay = days actually worked × dailyRate. No late/absent/
    // unpaid-leave deduction (paid per day already — a day not worked simply
    // isn't counted, so there's nothing left to deduct twice for). No holiday
    // pay for days not attended, including public/company holidays — a
    // deliberate policy decision (confirmed 2026-09; the company accepts the
    // labor-law tradeoff on ม.29's paid-traditional-holiday requirement).
    // SS/tax reuse the exact same formulas as MONTHLY, just fed this period's
    // actual earnings (daysWorked × dailyRate) in place of baseSalary — the
    // SS rate/cap rule and the withholding-tax estimate both apply to
    // actual monthly wages regardless of pay structure.
    //
    // NOTE (assumption, flagged 2026-09): positionAllowance/diligenceAllowance/
    // studentLoanDeduction/securityDeposit are User-level snapshots that apply
    // regardless of payType — the confirmed decisions never distinguished
    // MONTHLY vs DAILY for these, so they're applied here identically. Same
    // for the diligence-cut check: DAILY has no per-minute late deduction,
    // but "late" (status LATE) / "absent" (status ABSENT) / non-vacation leave
    // still count for cutting the diligence allowance, using simple status
    // counts (no rate-based amount needed since DAILY has no late deduction
    // to compute a billable-minutes rate from).
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

      // Same "flag, don't guess" treatment as MONTHLY's disabled-mid-month
      // case, worded for the fact that DAILY pay already naturally reflects
      // however many days this employee actually showed up before being
      // disabled — there's no full-nominal-amount overpayment to warn about,
      // just a nudge to double-check the numbers before approving.
      const disabledNote =
        emp.status === 'DISABLED'
          ? `⚠️ บัญชีถูกปิดใช้งานในเดือนนี้ (แก้ไขล่าสุด ${emp.updatedAt.toLocaleDateString('th-TH')}) — กรุณาตรวจสอบก่อนอนุมัติ`
          : undefined

      // เบี้ยขยัน — DAILY ไม่มี computeLateDeduction (ไม่หักละเอียดเป็นนาที)
      // จึงนับ late/absent แบบง่ายจาก status ตรงๆ พอสำหรับตัดสินใจตัด/ไม่ตัด
      const dailyLateDays = attendances.filter(
        (a) => a.status === 'LATE' || (a.lateMinutes ?? 0) > 0,
      ).length
      const dailyAbsentDays = attendances.filter((a) => a.status === 'ABSENT').length
      const diligence = computeDiligenceAllowance(emp.diligenceAllowanceDefault, {
        lateDays: dailyLateDays,
        absentDays: dailyAbsentDays,
        approvedLeaves,
      })

      // DAILY ไม่มีแนวคิด proration แยก — taxSsBaseSalary/payoutBaseSalary
      // เท่ากันทั้งคู่ (periodEarnings)
      const totals = computePayrollTotals({
        taxSsBaseSalary: periodEarnings,
        payoutBaseSalary: periodEarnings,
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
        lateDeduction: 0,
        absentDeduction: 0,
        unpaidLeaveDeduction: 0,
        earlyLeaveDeduction: 0,
        taxScheme: emp.taxScheme,
        socialSecurityEnabled: emp.socialSecurity,
      })
      const ssDeduction = totals.socialSecurity
      const taxDeduction = totals.taxDeduction
      const netSalary = totals.netSalary

      return {
        baseSalary: periodEarnings,
        lateDeduction: 0,
        absentDeduction: 0,
        unpaidLeave: 0,
        earlyLeaveDeduction: 0,
        socialSecurity: ssDeduction,
        taxDeduction,
        taxDetail: totals.taxDetail,
        netSalary,
        lateDays: 0,
        absentDays: 0,
        lateMinutes: 0,
        lateBillableMinutes: 0,
        lateDeductionDetail: null,
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
        ...(disabledNote ? { note: disabledNote } : {}),
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
    // "ยอดเต็มเดือน (ยังไม่ prorate)" only actually describes MONTHLY —
    // a DAILY employee's pay already only reflects days actually worked
    // before they were disabled, so it gets its own accurate wording rather
    // than a single blended message that's wrong for one of the two groups.
    const disabledMonthly = disabledIncluded.filter((e) => e.payType !== 'DAILY')
    const disabledDaily = disabledIncluded.filter((e) => e.payType === 'DAILY')
    const disabledWarningParts: string[] = []
    if (disabledMonthly.length > 0) {
      disabledWarningParts.push(
        `⚠️ รวม ${disabledMonthly.length} พนักงานรายเดือนที่ปิดบัญชีเดือนนี้ด้วยยอดเต็มเดือน (ยังไม่ prorate ให้อัตโนมัติ) ` +
        `กรุณาตรวจสอบก่อนอนุมัติ: ${disabledMonthly.map((e) => e.name).join(', ')}`,
      )
    }
    if (disabledDaily.length > 0) {
      disabledWarningParts.push(
        `⚠️ รวม ${disabledDaily.length} พนักงานรายวันที่ปิดบัญชีเดือนนี้ (ยอดคำนวณจากจำนวนวันที่มาทำงานจริงก่อนปิดบัญชีอยู่แล้ว) ` +
        `กรุณาตรวจสอบก่อนอนุมัติ: ${disabledDaily.map((e) => e.name).join(', ')}`,
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
    })
  } catch (err) {
    return apiError(err)
  }
}
