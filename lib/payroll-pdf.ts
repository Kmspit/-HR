import { rgb } from 'pdf-lib'
import { createPdfKitDocument, drawRect, drawHLine, drawText as drawPdfText, finalizePdfKitDocument, widthOf } from '@/lib/pdfkit-compat'
import { loadThaiPdfFontBytes } from '@/lib/thai-pdf-font'
import { formatLateMinutes } from '@/lib/utils'
import { payrollPeriodRange } from '@/lib/payroll-period'

export type SalarySlipInput = {
  companyName: string
  employeeName: string
  employeeId: string | null
  department: string | null
  position: string | null
  month: number
  year: number
  baseSalary: number
  lateDeduction: number
  absentDeduction: number
  unpaidLeave: number
  socialSecurity: number
  taxDeduction: number
  otherDeduction: number
  otherAddition: number
  /** ค่าตำแหน่ง (payroll fields batch 2, 2026-09) — snapshot จาก Payroll แสดงเมื่อ >0 เท่านั้น */
  positionAllowance?: number
  /** เบี้ยขยัน (payroll fields batch 2, 2026-09) — ยอดจริงหลังตัดกรณีขาด/ลา/สาย แสดงเมื่อ >0 เท่านั้น */
  diligenceAllowance?: number
  /** คอมมิชชั่น (payroll fields batch 2, 2026-09) — แสดงเมื่อ >0 เท่านั้น */
  commission?: number
  /** ค่าล่วงเวลา (OT, 2026-09) — HR กรอกยอดก้อนเดียวเอง แสดงเมื่อ >0 เท่านั้น
   * เดียวกับ otherAddition */
  overtimePay?: number
  /** โบนัส (2026-09) — แยกจาก otherAddition แสดงเมื่อ >0 เท่านั้น */
  bonus?: number
  /** กยศ. (payroll fields batch 2, 2026-09) — หักหลังภาษี แสดงเมื่อ >0 เท่านั้น */
  studentLoanDeduction?: number
  /** เงินประกันเข้างาน (payroll fields batch 2, 2026-09) — แสดงเมื่อ >0 เท่านั้น
   * ถ้ามี securityDepositInstallmentNo จะต่อท้ายเป็น "(งวด n/total)" */
  securityDepositDeduction?: number
  securityDepositInstallmentNo?: number | null
  securityDepositTotalInstallments?: number | null
  netSalary: number
  lateDays: number
  absentDays: number
  lateMinutes: number
  /** เงินรายวัน (payType='DAILY') — เมื่อมีค่า จะแสดง "จำนวนวันทำงาน ×
   *  ค่าจ้างต่อวัน" แทนแถว "เงินเดือนฐาน" ปกติ ไม่มีค่า/undefined = รายเดือน
   *  (พฤติกรรมเดิมทุกประการ) */
  payType?: string | null
  daysWorked?: number | null
  dailyRateUsed?: number | null
  taxDetail?: {
    annualGross?: number
    taxableIncome?: number
    annualTax?: number
    monthlyWithholding?: number
  } | null
  /** ยอดสะสมรายปี (2026-09) — สำหรับออกใบรับรองหักภาษี ณ ที่จ่าย 50 ทวิ,
   * derive สดจาก lib/payroll-ytd.ts (ไม่ใช่ค่า mutable) รวมทุกเดือนของปีนี้
   * จนถึงเดือนของสลิปนี้เอง ไม่มีค่า = ไม่แสดงกล่องนี้ (backward-compat กับ
   * สลิปเก่าก่อน feature นี้) */
  ytd?: {
    income: number
    taxNormal: number
    taxOffSystemWht: number
    socialSecurity: number
  } | null
}

const MONTH_TH = [
  '',
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

const MONTH_TH_SHORT = [
  '',
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]

function fmt(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** "เดือนกันยายน" ในสลิปยังหมายถึงเดือนปิดยอด/จ่ายเงินเหมือนเดิม — บรรทัดนี้
 *  บอกช่วงวันที่นับมาสาย/ขาด/ลาจริง (21 ของเดือนก่อน - 20 ของเดือนนี้)
 *  กันพนักงาน/HR สับสนว่าทำไมยอดไม่ตรงกับปฏิทินเต็มเดือน */
function formatPayrollPeriodCaption(month: number, year: number): string {
  const { start, end } = payrollPeriodRange(month, year)
  const startLabel = `${start.getDate()} ${MONTH_TH_SHORT[start.getMonth() + 1]}`
  const endLabel = `${end.getDate()} ${MONTH_TH_SHORT[end.getMonth() + 1]} ${end.getFullYear() + 543}`
  return `(นับเวลาทำงาน ${startLabel} - ${endLabel})`
}

export async function generateSalarySlipPdf(input: SalarySlipInput, password?: string): Promise<Buffer> {
  const thaiBytes = await loadThaiPdfFontBytes()

  const W = 595
  const H = 842
  const doc = createPdfKitDocument([W, H], password)
  doc.font(thaiBytes)
  const c = { dark: rgb(0.1, 0.1, 0.15), mid: rgb(0.35, 0.35, 0.4), light: rgb(0.6, 0.6, 0.65), green: rgb(0.1, 0.55, 0.3), red: rgb(0.75, 0.15, 0.15), accent: rgb(0.1, 0.35, 0.7), white: rgb(1, 1, 1), line: rgb(0.85, 0.85, 0.9) }

  const drawText = (text: string, x: number, y: number, size: number, color = c.dark) => {
    drawPdfText(doc, text, x, y, { size, color })
  }

  const drawLine = (y: number, x1 = 40, x2 = W - 40) => {
    drawHLine(doc, y, x1, x2, { thickness: 0.5, color: c.line })
  }

  const row = (label: string, value: string, y: number, valueColor = c.dark) => {
    drawText(label, 60, y, 10, c.mid)
    drawText(value, W - 60 - widthOf(doc, value, 10), y, 10, valueColor)
  }

  // Header bar
  drawRect(doc, 0, H - 70, W, 70, { fill: c.accent })
  drawText(input.companyName, 40, H - 38, 13, c.white)
  drawText('สลิปเงินเดือน (Salary Slip)', 40, H - 58, 10, rgb(0.75, 0.85, 1))

  const periodLabel = `${MONTH_TH[input.month]} ${input.year + 543}`
  const periodW = widthOf(doc, periodLabel, 12)
  drawText(periodLabel, W - 40 - periodW, H - 44, 12, c.white)

  const periodCaption = formatPayrollPeriodCaption(input.month, input.year)
  const periodCaptionW = widthOf(doc, periodCaption, 8)
  drawText(periodCaption, W - 40 - periodCaptionW, H - 58, 8, rgb(0.75, 0.85, 1))

  // Employee info box
  let y = H - 100
  drawRect(doc, 40, y - 54, W - 80, 64, { fill: rgb(0.97, 0.97, 1) })
  drawText('ข้อมูลพนักงาน', 52, y - 4, 9, c.accent)
  drawText(input.employeeName, 52, y - 20, 12, c.dark)
  const empMeta = [input.employeeId ? `รหัส: ${input.employeeId}` : null, input.department ?? null, input.position ?? null].filter(Boolean).join('  ·  ')
  if (empMeta) drawText(empMeta, 52, y - 36, 9, c.mid)

  const isDaily = input.payType === 'DAILY'

  // Section: รายได้
  y = H - 182
  drawText('รายได้', 60, y, 11, c.accent)
  drawLine(y - 6)
  y -= 20
  if (isDaily) {
    row(
      `ค่าจ้างรายวัน (${fmt(input.daysWorked ?? 0)} วัน × ฿${fmt(input.dailyRateUsed ?? 0)})`,
      `฿${fmt(input.baseSalary)}`,
      y,
    )
  } else {
    row('เงินเดือนฐาน', `฿${fmt(input.baseSalary)}`, y)
  }
  if ((input.positionAllowance ?? 0) > 0) {
    y -= 16
    row('ค่าตำแหน่ง', `+฿${fmt(input.positionAllowance ?? 0)}`, y, c.green)
  }
  if ((input.diligenceAllowance ?? 0) > 0) {
    y -= 16
    row('เบี้ยขยัน', `+฿${fmt(input.diligenceAllowance ?? 0)}`, y, c.green)
  }
  if ((input.commission ?? 0) > 0) {
    y -= 16
    row('คอมมิชชั่น', `+฿${fmt(input.commission ?? 0)}`, y, c.green)
  }
  if ((input.overtimePay ?? 0) > 0) {
    y -= 16
    row('ค่าล่วงเวลา (OT)', `+฿${fmt(input.overtimePay ?? 0)}`, y, c.green)
  }
  if ((input.bonus ?? 0) > 0) {
    y -= 16
    row('โบนัส', `+฿${fmt(input.bonus ?? 0)}`, y, c.green)
  }
  if (input.otherAddition > 0) {
    y -= 16
    row('รายได้อื่นๆ', `+฿${fmt(input.otherAddition)}`, y, c.green)
  }

  // Section: รายการหัก
  y -= 26
  drawText('รายการหัก', 60, y, 11, c.accent)
  drawLine(y - 6)
  y -= 20

  if (input.lateDeduction > 0) {
    row(`หักมาสาย (${input.lateDays} วัน · ${formatLateMinutes(input.lateMinutes)})`, `-฿${fmt(input.lateDeduction)}`, y, c.red)
    y -= 16
  }
  if (input.absentDeduction > 0) {
    row(`หักขาดงาน (${input.absentDays} วัน)`, `-฿${fmt(input.absentDeduction)}`, y, c.red)
    y -= 16
  }
  if (input.unpaidLeave > 0) {
    row('หักลาไม่รับเงิน', `-฿${fmt(input.unpaidLeave)}`, y, c.red)
    y -= 16
  }
  if (input.socialSecurity > 0) {
    row('ประกันสังคม (5%)', `-฿${fmt(input.socialSecurity)}`, y, c.red)
    y -= 16
  }
  if (input.taxDeduction > 0) {
    row('ภาษีหัก ณ ที่จ่าย (ภงด1)', `-฿${fmt(input.taxDeduction)}`, y, c.red)
    y -= 16
  }
  if (input.otherDeduction > 0) {
    row('หักอื่นๆ', `-฿${fmt(input.otherDeduction)}`, y, c.red)
    y -= 16
  }
  if ((input.studentLoanDeduction ?? 0) > 0) {
    row('กยศ.', `-฿${fmt(input.studentLoanDeduction ?? 0)}`, y, c.red)
    y -= 16
  }
  if ((input.securityDepositDeduction ?? 0) > 0) {
    const installmentLabel = input.securityDepositInstallmentNo
      ? ` (งวด ${input.securityDepositInstallmentNo}${input.securityDepositTotalInstallments ? `/${input.securityDepositTotalInstallments}` : ''})`
      : ''
    row(`เงินประกันเข้างาน${installmentLabel}`, `-฿${fmt(input.securityDepositDeduction ?? 0)}`, y, c.red)
    y -= 16
  }
  if (
    input.lateDeduction === 0 && input.absentDeduction === 0 && input.unpaidLeave === 0 &&
    input.socialSecurity === 0 && input.taxDeduction === 0 && input.otherDeduction === 0 &&
    (input.studentLoanDeduction ?? 0) === 0 && (input.securityDepositDeduction ?? 0) === 0
  ) {
    drawText('ไม่มีรายการหัก', 60, y, 10, c.light)
    y -= 16
  }

  // Tax detail box
  if (input.taxDetail && input.taxDeduction > 0) {
    y -= 10
    drawRect(doc, 40, y - 56, W - 80, 66, { fill: rgb(0.96, 0.98, 1) })
    drawText('รายละเอียดภาษี (ภงด1)', 52, y - 4, 9, c.accent)
    const td = input.taxDetail
    if (td.annualGross) { drawText(`รายได้รวมปีละ: ฿${fmt(td.annualGross)}`, 52, y - 18, 9, c.mid); }
    if (td.taxableIncome) { drawText(`เงินได้สุทธิ: ฿${fmt(td.taxableIncome)}`, 200, y - 18, 9, c.mid); }
    if (td.annualTax) { drawText(`ภาษีรายปี: ฿${fmt(td.annualTax)}`, 350, y - 18, 9, c.mid); }
    drawText(`ภาษีรายเดือน (หัก ณ ที่จ่าย): ฿${fmt(input.taxDeduction)}`, 52, y - 34, 9, c.mid)
    y -= 66
  }

  // YTD box (2026-09) — 4 ยอดสะสมสำหรับออกใบรับรองหักภาษี ณ ที่จ่าย 50 ทวิ
  if (input.ytd) {
    y -= 10
    drawRect(doc, 40, y - 56, W - 80, 66, { fill: rgb(0.98, 0.97, 0.94) })
    drawText(`ยอดสะสมตั้งแต่ต้นปี (สำหรับ 50 ทวิ) — ถึงเดือน${MONTH_TH[input.month]} ${input.year + 543}`, 52, y - 4, 9, c.accent)
    drawText(`รายได้สะสม: ฿${fmt(input.ytd.income)}`, 52, y - 18, 9, c.mid)
    drawText(`ประกันสังคมสะสม: ฿${fmt(input.ytd.socialSecurity)}`, 300, y - 18, 9, c.mid)
    drawText(`ภาษีสะสม: ฿${fmt(input.ytd.taxNormal)}`, 52, y - 34, 9, c.mid)
    drawText(`WHT สะสม: ฿${fmt(input.ytd.taxOffSystemWht)}`, 300, y - 34, 9, c.mid)
    y -= 66
  }

  // Net salary
  y -= 14
  drawLine(y + 10)
  drawRect(doc, 40, y - 32, W - 80, 42, { fill: rgb(0.94, 0.99, 0.96) })
  drawText('เงินเดือนสุทธิ (Net Salary)', 60, y - 4, 11, c.dark)
  const netStr = `฿${fmt(input.netSalary)}`
  const netW = widthOf(doc, netStr, 16)
  drawText(netStr, W - 60 - netW, y - 6, 16, c.green)

  // Footer
  const footerY = 40
  drawLine(footerY + 18)
  drawText('เอกสารนี้ออกโดยระบบ HRFlow — โปรดเก็บรักษาไว้เป็นหลักฐาน', 40, footerY + 4, 8, c.light)
  const dateStr = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
  const printedLabel = `วันที่พิมพ์: ${dateStr}`
  drawText(printedLabel, W - 40 - widthOf(doc, printedLabel, 8), footerY + 4, 8, c.light)

  return finalizePdfKitDocument(doc)
}
