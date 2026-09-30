import { bangkokDateKey, dayOfWeekBangkok, startOfDayBangkok } from '@/lib/datetime-bangkok'
import { getHolidayForDate, type HolidayRecord } from '@/lib/company-holidays'

/**
 * Counts working days in a payroll period that have NO Attendance row at all
 * and NO approved leave covering them — i.e. genuine unauthorized absence
 * that the system previously never deducted for at all (app/api/payroll/
 * generate/route.ts's absentDays only ever counted rows with an explicit
 * status='ABSENT', which nothing in the codebase ever writes automatically —
 * a day with zero attendance data was silently skipped, not counted as 0).
 *
 * Only meaningful for MONTHLY employees (a DAILY employee's pay is already
 * daysWorked × dailyRate — no base salary to dock, see lib/payroll-daily-
 * wage.ts) and only for employees who are ACTIVE for the whole period —
 * callers must not invoke this for a DISABLED employee, since the system has
 * no reliable "last working day" signal for someone who left mid-period
 * (EmploymentAssignment.contractEndDate is not guaranteed to exist — PATCH
 * /api/users/[id] can set status=DISABLED without ever creating a
 * termination assignment) and guessing wrong here means wrongly docking pay
 * from someone who already left.
 */

export type UnrecordedAbsenceParams = {
  periodStart: Date
  periodEnd: Date
  /** "now" — days on/after this (in Bangkok calendar terms) are never counted,
   *  since HR may generate payroll before the period has actually finished
   *  and today's/future attendance simply hasn't happened yet. Passed in
   *  (not read internally) so this stays a pure, deterministically testable
   *  function — same convention as lib/attendance-time-calc.ts's `now` param. */
  today: Date
  /** bangkokDateKey() of every date that already has ANY Attendance row for
   *  this employee in this period, regardless of status — a day with a real
   *  row (even status='ABSENT') is never re-counted here, only genuinely
   *  data-less days are. */
  attendanceDateKeys: Set<string>
  /** Output of the existing buildApprovedLeaveDateSet() — already filtered
   *  to APPROVED/ADMIN_APPROVED only, so a pending leave request correctly
   *  does NOT exclude a day here (still counts as unauthorized absence,
   *  confirmed intentional per the approved plan). */
  leaveDateKeys: Set<string>
  holidays: HolidayRecord[]
  branchId: string | null
  /** User.startDate — days before this are excluded (not yet hired). Null
   *  means unknown/legacy data; treated as "no lower bound" (same default
   *  the existing proration logic in buildMonthlyPayload already uses). */
  employeeStartDate: Date | null
}

/** Last day-of-month (1-indexed month) via UTC arithmetic — timezone-safe,
 *  no reliance on the runtime's local timezone. */
function lastCalendarDayOfMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate()
}

/** The bangkokDateKey of the last Saturday of the given (year, 1-indexed
 *  month) — a Saturday always falls within the last 7 days of any month, so
 *  this never fails to find one. Exported for its own focused unit test. */
export function bangkokLastSaturdayKeyOfMonth(year: number, month1: number): string {
  const lastDay = lastCalendarDayOfMonth(year, month1)
  for (let d = lastDay; d >= lastDay - 6; d--) {
    const dateKey = `${year}-${String(month1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const dow = new Date(`${dateKey}T00:00:00Z`).getUTCDay()
    if (dow === 6) return dateKey
  }
  /* istanbul ignore next -- unreachable, a Saturday always exists in the last 7 days of any month */
  throw new Error('unreachable — a Saturday always exists within the last 7 days of any month')
}

/**
 * Whether `day` (a Bangkok-midnight-anchored Date) is a working day.
 *
 * Real holiday config (getHolidayForDate — covers PUBLIC_HOLIDAY/
 * COMPANY_HOLIDAY always, plus SATURDAY/SUNDAY if configured) always wins
 * and is checked first. The Sat/Sun fallback below only ever applies when
 * NO SATURDAY/SUNDAY-type record exists in company_holidays at all — company
 * confirmed rule (2026-09-30): last Saturday of each calendar month is a
 * working day, every other Saturday and every Sunday is not. This fallback
 * exists only because, as of 2026-09-30, this company has zero SATURDAY/
 * SUNDAY holiday records configured (only 14 PUBLIC_HOLIDAY ones) — every
 * other feature that reads company_holidays only ever iterates existing
 * Attendance rows, so this gap was invisible until a feature (this one) had
 * to reason about every calendar day regardless of whether data exists.
 */
function isWorkingDay(
  day: Date,
  holidays: HolidayRecord[],
  branchId: string | null,
  hasSaturdayConfig: boolean,
  hasSundayConfig: boolean,
): boolean {
  if (getHolidayForDate(day, branchId, holidays)) return false

  const dow = dayOfWeekBangkok(day)
  if (dow === 0) return hasSundayConfig
  if (dow === 6) {
    if (hasSaturdayConfig) return true
    const dateKey = bangkokDateKey(day)
    const [yearStr, monthStr] = dateKey.split('-')
    return dateKey === bangkokLastSaturdayKeyOfMonth(Number(yearStr), Number(monthStr))
  }
  return true
}

export function countUnrecordedAbsenceDays(params: UnrecordedAbsenceParams): number {
  const {
    periodStart, periodEnd, today,
    attendanceDateKeys, leaveDateKeys, holidays, branchId, employeeStartDate,
  } = params

  const hasSaturdayConfig = holidays.some((h) => h.holidayType === 'SATURDAY')
  const hasSundayConfig = holidays.some((h) => h.holidayType === 'SUNDAY')

  // All boundary comparisons done as bangkokDateKey STRINGS (lexicographically
  // sortable, YYYY-MM-DD) rather than raw Date comparisons — periodStart/
  // periodEnd/employeeStartDate/today may each carry a different, arbitrary
  // time-of-day offset (payrollPeriodRange's local-time construction behaves
  // differently depending on the runtime's timezone), so comparing "which
  // calendar day is later" only ever via the Bangkok-projected key stays
  // correct regardless of how each Date was originally constructed.
  const periodStartKey = bangkokDateKey(periodStart)
  const periodEndKey = bangkokDateKey(periodEnd)
  const yesterdayKey = bangkokDateKey(new Date(today.getTime() - 86_400_000))
  const upperBoundKey = periodEndKey < yesterdayKey ? periodEndKey : yesterdayKey
  const employeeStartKey = employeeStartDate ? bangkokDateKey(employeeStartDate) : null
  const lowerBoundKey = employeeStartKey && employeeStartKey > periodStartKey ? employeeStartKey : periodStartKey

  if (lowerBoundKey > upperBoundKey) return 0

  let count = 0
  let cursor = startOfDayBangkok(new Date(`${lowerBoundKey}T00:00:00+07:00`))
  const upperAnchor = startOfDayBangkok(new Date(`${upperBoundKey}T00:00:00+07:00`))
  while (cursor.getTime() <= upperAnchor.getTime()) {
    const dateKey = bangkokDateKey(cursor)
    if (
      !attendanceDateKeys.has(dateKey) &&
      !leaveDateKeys.has(dateKey) &&
      isWorkingDay(cursor, holidays, branchId, hasSaturdayConfig, hasSundayConfig)
    ) {
      count++
    }
    cursor = new Date(cursor.getTime() + 86_400_000)
  }
  return count
}
