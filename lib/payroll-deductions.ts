import { type HolidayRecord, getHolidayForDate, toDateKey } from '@/lib/company-holidays'
import {
  SALARY_DAYS_PER_MONTH,
  WORK_HOURS_PER_DAY,
  WORK_MINUTES_PER_HOUR,
  roundMoney,
} from '@/lib/payroll-late-deduction'
import { addDaysToKey, daysBetweenKeysInclusive } from '@/lib/payroll-period'

/**
 * สูตรหักเงิน/prorate ตามประเภทพนักงาน (2026-10, fix/payroll-formulas-round1)
 *
 * ค่าแรงต่อวัน: รายเดือน = เงินเดือนเต็ม ÷ 30 (ไม่ใช่ยอดหลัง prorate, เลิกใช้ ÷ 26)
 *              รายวัน   = ค่าแรงรายวัน
 * ค่าแรงต่อนาที = ค่าแรงต่อวัน ÷ 8 ÷ 60
 *
 * ปัดเศษ: คิดสูตรเต็มก่อน แล้วปัด 2 ตำแหน่งทีละวัน แล้วค่อยรวมทั้งเดือน
 *
 * POLICY #7 (ยืนยัน 2026-10-07 — ห้ามเปลี่ยน ÷30 / ÷8 ÷60 โดยไม่ถามผู้ใช้,
 * ดู CLAUDE.md § Payroll policy)
 */

export function dailyWageRate(params: { payType: string | null | undefined; baseSalary: number | null | undefined; dailyRate: number | null | undefined }): number {
  if (params.payType === 'DAILY') return Math.max(0, params.dailyRate ?? 0)
  return Math.max(0, params.baseSalary ?? 0) / SALARY_DAYS_PER_MONTH
}

export function perMinuteWageRate(dailyRate: number): number {
  return dailyRate / WORK_HOURS_PER_DAY / WORK_MINUTES_PER_HOUR
}

/** หักรายวัน (ขาดงาน/ลาไม่รับเงิน): ปัดค่าแรงต่อวันก่อน แล้วคูณจำนวนวัน */
export function perDayDeduction(dailyRate: number, days: number): number {
  if (days <= 0 || dailyRate <= 0) return 0
  return roundMoney(roundMoney(dailyRate) * days)
}

export type EarlyLeaveDeductionResult = {
  earlyLeaveDeduction: number
  earlyLeaveDays: number
  earlyLeaveMinutes: number
}

/**
 * หักกลับก่อน: ค่าแรงต่อนาที × นาทีที่กลับก่อนจริง (เลิกหักครึ่งวันต่อครั้ง) ปัด
 * ทีละวัน — ไม่หักวันลาอนุมัติ/วันหยุด เหมือนหักมาสาย (computeLateDeduction)
 */
export function computeEarlyLeaveDeduction(params: {
  ratePerMinute: number
  attendances: { date: Date; earlyLeaveMinutes: number | null }[]
  leaveDateKeys: Set<string>
  holidays: HolidayRecord[]
  branchId: string | null
}): EarlyLeaveDeductionResult {
  let earlyLeaveDeduction = 0
  let earlyLeaveDays = 0
  let earlyLeaveMinutes = 0
  for (const att of params.attendances) {
    const minutes = Math.max(0, att.earlyLeaveMinutes ?? 0)
    if (minutes <= 0) continue
    if (params.leaveDateKeys.has(toDateKey(att.date))) continue
    if (getHolidayForDate(att.date, params.branchId, params.holidays)) continue
    earlyLeaveDeduction += roundMoney(params.ratePerMinute * minutes)
    earlyLeaveDays += 1
    earlyLeaveMinutes += minutes
  }
  return { earlyLeaveDeduction: roundMoney(earlyLeaveDeduction), earlyLeaveDays, earlyLeaveMinutes }
}

/** จำนวนวันปฏิทินของใบลาที่อยู่ในรอบนี้จริง (ใบลาคร่อม 2 รอบหักแค่ส่วนในรอบ) —
 *  นับแบบเดียวกับ LeaveRequest.days (วันปฏิทินรวมหัวท้าย, app/api/leave/route.ts) */
export function leaveDaysWithinPeriod(
  leaves: { startDate: Date; endDate: Date }[],
  period: { startKey: string; endKey: string },
): number {
  let days = 0
  for (const l of leaves) {
    const fromKey = [toDateKey(l.startDate), period.startKey].sort()[1]
    const toKey = [toDateKey(l.endDate), period.endKey].sort()[0]
    days += daysBetweenKeysInclusive(fromKey, toKey)
  }
  return days
}

export type MonthlyProrationResult = {
  /** เงินเดือนงวดนี้หลัง prorate (0 ≤ amount ≤ เงินเดือนเต็ม) */
  amount: number
  daysBeforeStart: number
  daysAfterLastWorking: number
  prorated: boolean
}

/**
 * Prorate รายเดือน (รอบ 21–20):
 *   เข้าใหม่กลางรอบ: เงินเดือน − ค่าแรงต่อวัน × จำนวนวันในรอบก่อนวันเริ่มงาน
 *   ลาออกกลางรอบ:   เงินเดือน − ค่าแรงต่อวัน × จำนวนวันในรอบหลังวันทำงานวันสุดท้าย
 * ค่าแรงต่อวัน = เงินเดือนเต็ม ÷ 30 ผลลัพธ์บีบไว้ที่ 0..เงินเดือนเต็ม ปัด 2 ตำแหน่งตอนท้าย
 * ตัวอย่าง (รอบ ต.ค. 2569 = 21 ก.ย.–20 ต.ค.): 30,000 เริ่ม 6 ต.ค. → 15,000 ·
 * 30,000 วันสุดท้าย 10 ต.ค. → 20,000
 */
export function computeMonthlyProration(params: {
  baseSalary: number
  period: { startKey: string; endKey: string }
  startDate: Date | null | undefined
  lastWorkingDate: Date | null | undefined
}): MonthlyProrationResult {
  const base = Math.max(0, params.baseSalary)
  const { startKey, endKey } = params.period
  const empStartKey = params.startDate ? toDateKey(params.startDate) : null
  const lastKey = params.lastWorkingDate ? toDateKey(params.lastWorkingDate) : null

  const daysBeforeStart =
    empStartKey && empStartKey > startKey
      ? daysBetweenKeysInclusive(startKey, [addDaysToKey(empStartKey, -1), endKey].sort()[0])
      : 0
  const daysAfterLastWorking =
    lastKey && lastKey < endKey
      ? daysBetweenKeysInclusive([addDaysToKey(lastKey, 1), startKey].sort()[1], endKey)
      : 0

  const daily = base / SALARY_DAYS_PER_MONTH
  const raw = base - daily * (daysBeforeStart + daysAfterLastWorking)
  const amount = roundMoney(Math.min(base, Math.max(0, raw)))
  return { amount, daysBeforeStart, daysAfterLastWorking, prorated: daysBeforeStart + daysAfterLastWorking > 0 }
}
