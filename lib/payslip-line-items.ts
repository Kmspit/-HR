import { formatLateMinutes } from '@/lib/utils'
import { parseTaxDetail } from '@/lib/payroll-tax'

/**
 * รายการรายได้/รายการหักของสลิปเงินเดือน (2026-10) — แหล่งเดียวที่ทุกจุดแสดง
 * สลิปต้องใช้ (PDF ใน lib/payroll-pdf.ts ซึ่งเป็นไฟล์เดียวกับที่ส่งทาง LINE
 * และหน้าเว็บ /payslip) เพื่อให้ทุกที่แสดงเหมือนกันเป๊ะ
 *
 * กติกา (ยืนยันกับผู้ใช้ 2026-10):
 * - แถวหลักแสดงครบทุกแถวตามลำดับคงที่เสมอ ค่า 0 แสดง "-"
 * - รายการที่ระบบยังไม่มี field (ค่าประสบการณ์/ค่าภาษา/ค่าข้าว/เงินคืนอื่น ๆ/
 *   OT แยกอัตรา/เงินยืมบริษัท) → amount = null แสดง "-" เสมอ ห้ามเดาค่า
 * - field ที่ระบบมีแต่ไม่อยู่ในแถวหลัก (OT ก้อนเดียว/โบนัส/ตกเบิก/รายได้อื่นๆ/
 *   กยศ.) → แถวเสริมต่อท้าย แสดงเฉพาะตอนมีค่า ห้ามหายไปจากสลิป
 * - หักภาษี = OFF_SYSTEM_WHT 3% + ภงด.3 40(6) (ทั้งคู่ยื่น ภงด.3)
 *   ภงด1(40)(1)/(40)(2) = ภาษีขั้นบันได (taxScheme ปกติ) แยกตาม taxDetail
 *
 * ไม่คำนวณเงินเดือนใหม่ — แค่จัดกลุ่ม/แสดงค่าที่ Payroll เก็บไว้แล้วเท่านั้น
 */

export type PayslipLineItem = {
  key: string
  label: string
  /** null = ระบบยังไม่มีข้อมูลรายการนี้ (แสดง "-" เสมอ) */
  amount: number | null
  /** บรรทัดอธิบายย่อยใต้แถว (เช่น รายละเอียดวันทำงานรายวัน/งวดเงินประกัน) */
  detail?: string[]
}

export type PayslipLineItems = {
  earnings: PayslipLineItem[]
  totalEarnings: number
  deductions: PayslipLineItem[]
  totalDeductions: number
}

export type PayslipLineItemSource = {
  baseSalary: number
  payType?: string | null
  daysWorked?: number | null
  dailyRateUsed?: number | null
  positionAllowance?: number | null
  diligenceAllowance?: number | null
  professionalFee?: number | null
  commission?: number | null
  overtimePay?: number | null
  bonus?: number | null
  backPay?: number | null
  otherAddition?: number | null
  taxScheme?: string | null
  taxDeduction?: number | null
  taxDetail?: string | null
  professionalFeeTax?: number | null
  socialSecurity: number
  securityDepositDeduction?: number | null
  securityDepositInstallmentNo?: number | null
  securityDepositTotalInstallments?: number | null
  lateDeduction: number
  lateDays: number
  lateMinutes: number
  absentDeduction: number
  absentDays: number
  unpaidLeave: number
  earlyLeaveDeduction?: number | null
  otherDeduction?: number | null
  studentLoanDeduction?: number | null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function money(n: number): string {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** ค่า 0 หรือรายการที่ระบบยังไม่มี (null) แสดง "-" */
export function formatPayslipAmount(amount: number | null): string {
  if (amount === null || amount === 0) return '-'
  return money(amount)
}

/** แยกภาษีขั้นบันไดเป็น 40(1)/40(2) จาก taxDetail ที่ computePayrollTotals เก็บไว้
 *  (tax40_1 + tax40_2 = taxDeduction พอดี) — taxDetail เก่าก่อน payroll fields
 *  batch 2 ไม่มี breakdown: ถ้าไม่มีคอมมิชชั่นทั้งหมดคือ 40(1) แน่นอน ถ้ามีจึงแบ่ง
 *  ตามสัดส่วนรายได้ สูตรเดียวกับ lib/payroll-totals.ts */
function splitProgressiveTax(p: PayslipLineItemSource, tax: number): { tax40_1: number; tax40_2: number } {
  if (tax <= 0) return { tax40_1: 0, tax40_2: 0 }
  const detail = parseTaxDetail(p.taxDetail)
  if (detail && typeof detail.tax40_1 === 'number' && typeof detail.tax40_2 === 'number') {
    return { tax40_1: detail.tax40_1, tax40_2: detail.tax40_2 }
  }
  const commission = p.commission ?? 0
  if (commission <= 0) return { tax40_1: tax, tax40_2: 0 }
  const gross =
    p.baseSalary + (p.positionAllowance ?? 0) + (p.diligenceAllowance ?? 0) + (p.backPay ?? 0) +
    commission + (p.overtimePay ?? 0) + (p.bonus ?? 0)
  const tax40_2 = gross > 0 ? round2((tax * commission) / gross) : 0
  return { tax40_1: round2(tax - tax40_2), tax40_2 }
}

export function buildPayslipLineItems(p: PayslipLineItemSource): PayslipLineItems {
  const isDaily = p.payType === 'DAILY'
  const isOffSystemWht = p.taxScheme === 'OFF_SYSTEM_WHT'
  const taxDeduction = p.taxDeduction ?? 0
  const professionalFeeTax = p.professionalFeeTax ?? 0

  const earnings: PayslipLineItem[] = [
    {
      key: 'wage',
      label: 'ค่าแรง',
      amount: p.baseSalary,
      ...(isDaily
        ? { detail: [`รายวัน ${money(p.daysWorked ?? 0)} วัน × ฿${money(p.dailyRateUsed ?? 0)}`] }
        : {}),
    },
    { key: 'positionAllowance', label: 'ค่าตำแหน่ง', amount: p.positionAllowance ?? 0 },
    { key: 'experienceAllowance', label: 'ค่าประสบการณ์', amount: null },
    { key: 'languageAllowance', label: 'ค่าภาษา', amount: null },
    { key: 'diligenceAllowance', label: 'เบี้ยขยัน', amount: p.diligenceAllowance ?? 0 },
    { key: 'mealAllowance', label: 'ค่าข้าว', amount: null },
    { key: 'professionalFee', label: 'ค่าวิชาชีพ', amount: p.professionalFee ?? 0 },
    { key: 'commission', label: 'ค่าคอมมิชชั่น', amount: p.commission ?? 0 },
    { key: 'otherRefund', label: 'เงินคืนอื่น ๆ', amount: null },
    { key: 'ot1', label: 'OT1', amount: null },
    { key: 'ot1_5', label: 'OT1.5', amount: null },
    { key: 'ot2', label: 'OT2', amount: null },
    { key: 'ot3', label: 'OT3', amount: null },
  ]
  const earningExtras: PayslipLineItem[] = [
    { key: 'overtimePay', label: 'ค่าล่วงเวลา (ไม่แยกอัตรา)', amount: p.overtimePay ?? 0 },
    { key: 'bonus', label: 'โบนัส', amount: p.bonus ?? 0 },
    { key: 'backPay', label: 'ตกเบิก', amount: p.backPay ?? 0 },
    { key: 'otherAddition', label: 'รายได้อื่นๆ', amount: p.otherAddition ?? 0 },
  ]
  earnings.push(...earningExtras.filter((i) => (i.amount ?? 0) !== 0))

  // หักภาษี (ภงด.3): OFF_SYSTEM_WHT 3% + ค่าวิชาชีพ 40(6)
  const offSystemWht = isOffSystemWht ? taxDeduction : 0
  const withholdingTax = round2(offSystemWht + professionalFeeTax)
  const withholdingDetail: string[] = []
  if (offSystemWht !== 0) withholdingDetail.push(`หัก ณ ที่จ่าย 3% ฿${money(offSystemWht)}`)
  if (professionalFeeTax !== 0) withholdingDetail.push(`ค่าวิชาชีพ 40(6) ฿${money(professionalFeeTax)}`)
  const { tax40_1, tax40_2 } = splitProgressiveTax(p, isOffSystemWht ? 0 : taxDeduction)

  const earlyLeaveDeduction = p.earlyLeaveDeduction ?? 0
  const attendanceDeduction = round2(p.lateDeduction + p.absentDeduction + p.unpaidLeave + earlyLeaveDeduction)
  const attendanceDetail: string[] = []
  if (p.lateDeduction !== 0) {
    attendanceDetail.push(`มาสาย ${p.lateDays} วัน · ${formatLateMinutes(p.lateMinutes)} ฿${money(p.lateDeduction)}`)
  }
  if (p.absentDeduction !== 0) attendanceDetail.push(`ขาดงาน ${p.absentDays} วัน ฿${money(p.absentDeduction)}`)
  if (p.unpaidLeave !== 0) attendanceDetail.push(`ลาไม่รับเงิน ฿${money(p.unpaidLeave)}`)
  if (earlyLeaveDeduction !== 0) attendanceDetail.push(`กลับก่อน ฿${money(earlyLeaveDeduction)}`)

  const securityDeposit = p.securityDepositDeduction ?? 0
  const securityDepositDetail =
    securityDeposit !== 0 && p.securityDepositInstallmentNo
      ? [`งวด ${p.securityDepositInstallmentNo}${p.securityDepositTotalInstallments ? `/${p.securityDepositTotalInstallments}` : ''}`]
      : undefined

  const deductions: PayslipLineItem[] = [
    { key: 'withholdingTax', label: 'หักภาษี', amount: withholdingTax, ...(withholdingDetail.length ? { detail: withholdingDetail } : {}) },
    { key: 'pnd1_40_1', label: 'ภงด1(40)(1)', amount: tax40_1 },
    { key: 'pnd1_40_2', label: 'ภงด1(40)(2)', amount: tax40_2 },
    { key: 'socialSecurity', label: 'หักประกันสังคม', amount: p.socialSecurity },
    { key: 'securityDeposit', label: 'หักเงินประกัน', amount: securityDeposit, ...(securityDepositDetail ? { detail: securityDepositDetail } : {}) },
    { key: 'attendance', label: 'ขาดงาน/มาสาย', amount: attendanceDeduction, ...(attendanceDetail.length ? { detail: attendanceDetail } : {}) },
    { key: 'companyLoan', label: 'เงินยืมบริษัท', amount: null },
    { key: 'otherDeduction', label: 'หักอื่นๆ', amount: p.otherDeduction ?? 0 },
  ]
  const deductionExtras: PayslipLineItem[] = [
    { key: 'studentLoan', label: 'กยศ.', amount: p.studentLoanDeduction ?? 0 },
  ]
  deductions.push(...deductionExtras.filter((i) => (i.amount ?? 0) !== 0))

  const sum = (items: PayslipLineItem[]) => round2(items.reduce((s, i) => s + (i.amount ?? 0), 0))
  return {
    earnings,
    totalEarnings: sum(earnings),
    deductions,
    totalDeductions: sum(deductions),
  }
}
