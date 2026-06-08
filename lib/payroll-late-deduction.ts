import {
  type HolidayRecord,
  getHolidayForDate,
  toDateKey,
} from '@/lib/company-holidays'

/** Grace period ถูกหักแล้ว ณ เวลาเช็คอิน (lateMinutes ในฐานข้อมูลคือนาทีจาก effective deadline แล้ว) */
export const PAYROLL_LATE_GRACE_MINUTES = 0

export const SALARY_DAYS_PER_MONTH = 30
export const WORK_HOURS_PER_DAY = 8
export const WORK_MINUTES_PER_HOUR = 60

const APPROVED_LEAVE_STATUSES = ['APPROVED', 'ADMIN_APPROVED'] as const

export type LateDeductionLine = {
  date: string
  recordedLateMinutes: number
  billableMinutes: number
  amount: number
  holidayName?: string
  excludedReason?: 'leave' | 'holiday' | 'grace_only' | 'not_late'
}

export type LateDeductionResult = {
  lateDeduction: number
  lateDays: number
  /** นาทีที่นำไปหัก (หลัง grace) — เก็บใน Payroll.lateMinutes */
  billableLateMinutes: number
  recordedLateMinutes: number
  ratePerMinute: number
  lines: LateDeductionLine[]
}

export function lateRatePerMinute(baseSalary: number): number {
  if (baseSalary <= 0) return 0
  return (
    baseSalary /
    SALARY_DAYS_PER_MONTH /
    WORK_HOURS_PER_DAY /
    WORK_MINUTES_PER_HOUR
  )
}

export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100
}

/** วันที่อยู่ในช่วงลาอนุมัติ (ทุกประเภท) */
export function buildApprovedLeaveDateSet(
  leaves: { startDate: Date; endDate: Date; status: string }[],
  rangeStart: Date,
  rangeEnd: Date,
): Set<string> {
  const set = new Set<string>()
  for (const leave of leaves) {
    if (!APPROVED_LEAVE_STATUSES.includes(leave.status as (typeof APPROVED_LEAVE_STATUSES)[number])) {
      continue
    }
    const start = new Date(Math.max(leave.startDate.getTime(), rangeStart.getTime()))
    const end = new Date(Math.min(leave.endDate.getTime(), rangeEnd.getTime()))
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      set.add(toDateKey(d))
    }
  }
  return set
}

export function isLateAttendance(att: { lateMinutes: number; status: string }): boolean {
  return att.status === 'LATE' || (att.lateMinutes ?? 0) > 0
}

/**
 * หักมาสาย: เงินเดือน ÷ 30 ÷ 8 ÷ 60 × นาทีที่มาสาย
 * lateMinutes ที่บันทึกในฐานข้อมูลคือนาทีจาก effective deadline (หลัง grace period แล้ว)
 * ไม่หักวันลาอนุมัติ / วันหยุด
 */
export function computeLateDeduction(params: {
  baseSalary: number
  attendances: { date: Date; lateMinutes: number; status: string }[]
  leaveDateKeys: Set<string>
  holidays: HolidayRecord[]
  branchId: string | null
}): LateDeductionResult {
  const { baseSalary, attendances, leaveDateKeys, holidays, branchId } = params
  const rate = lateRatePerMinute(baseSalary)
  const lines: LateDeductionLine[] = []

  let billableLateMinutes = 0
  let recordedLateMinutes = 0
  let lateDays = 0
  let lateDeduction = 0

  const sorted = [...attendances].sort((a, b) => a.date.getTime() - b.date.getTime())

  for (const att of sorted) {
    if (!isLateAttendance(att)) continue

    const dateKey = toDateKey(att.date)
    const recorded = Math.max(0, att.lateMinutes ?? 0)
    recordedLateMinutes += recorded

    if (leaveDateKeys.has(dateKey)) {
      lines.push({
        date: dateKey,
        recordedLateMinutes: recorded,
        billableMinutes: 0,
        amount: 0,
        excludedReason: 'leave',
      })
      continue
    }

    const holidayHit = getHolidayForDate(att.date, branchId, holidays)
    if (holidayHit) {
      lines.push({
        date: dateKey,
        recordedLateMinutes: recorded,
        billableMinutes: 0,
        amount: 0,
        excludedReason: 'holiday',
        holidayName: holidayHit.name,
      })
      continue
    }

    const billable = Math.max(0, recorded - PAYROLL_LATE_GRACE_MINUTES)
    if (billable <= 0) {
      lines.push({
        date: dateKey,
        recordedLateMinutes: recorded,
        billableMinutes: 0,
        amount: 0,
        excludedReason: 'grace_only',
      })
      continue
    }

    const amount = roundMoney(rate * billable)
    billableLateMinutes += billable
    lateDays += 1
    lateDeduction += amount
    lines.push({
      date: dateKey,
      recordedLateMinutes: recorded,
      billableMinutes: billable,
      amount,
    })
  }

  return {
    lateDeduction: roundMoney(lateDeduction),
    lateDays,
    billableLateMinutes,
    recordedLateMinutes,
    ratePerMinute: rate,
    lines,
  }
}

export function parseLateDeductionDetail(raw: string | null | undefined): LateDeductionLine[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (x): x is LateDeductionLine =>
        typeof x === 'object' &&
        x != null &&
        typeof (x as LateDeductionLine).date === 'string',
    )
  } catch {
    return []
  }
}

export function serializeLateDeductionDetail(lines: LateDeductionLine[]): string {
  return JSON.stringify(lines)
}
