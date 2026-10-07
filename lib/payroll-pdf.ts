import { rgb } from 'pdf-lib'
import { createPdfKitDocument, drawRect, drawHLine, drawText as drawPdfText, finalizePdfKitDocument, widthOf } from '@/lib/pdfkit-compat'
import { loadThaiPdfFontBytes } from '@/lib/thai-pdf-font'
import { dateKeyParts, payrollPeriodKeys } from '@/lib/payroll-period'
import { buildPayslipLineItems, formatPayslipAmount, type PayslipLineItem } from '@/lib/payslip-line-items'

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
  /** (2026-10, feat/payslip-all-items) field ที่นับใน netSalary อยู่แล้วแต่สลิป
   * เดิมไม่เคยแสดง — ส่งต่อให้ lib/payslip-line-items.ts จัดแถวเท่านั้น */
  backPay?: number
  professionalFee?: number
  professionalFeeTax?: number
  earlyLeaveDeduction?: number
  /** ใช้แยกช่อง "หักภาษี" (OFF_SYSTEM_WHT, ภงด.3) กับ ภงด1(40)(1)/(40)(2) */
  taxScheme?: string | null
  taxDetail?: string | null
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
  // อ่านจาก date key ตรงๆ ไม่ใช่ getDate() — ดูหมายเหตุ timezone ใน lib/payroll-period.ts
  const { startKey, endKey } = payrollPeriodKeys(month, year)
  const start = dateKeyParts(startKey)
  const end = dateKeyParts(endKey)
  const startLabel = `${start.day} ${MONTH_TH_SHORT[start.month]}`
  const endLabel = `${end.day} ${MONTH_TH_SHORT[end.month]} ${end.year + 543}`
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

  // Sections: รายได้ (ซ้าย) | รายการหัก (ขวา) — 2026-10 feat/payslip-all-items:
  // แสดงครบทุกแถวตามลำดับคงที่จาก lib/payslip-line-items.ts (แหล่งเดียวกับ
  // หน้าเว็บ /payslip) ค่า 0/ไม่มีข้อมูลแสดง "-" — วาง 2 คอลัมน์คู่กันเพราะ
  // รายการครบทุกแถวเรียงคอลัมน์เดียวแล้วล้นหน้า A4 ทับ footer
  const items = buildPayslipLineItems(input)
  const sectionTop = H - 182
  const colGap = 11
  const colW = (W - 80 - colGap) / 2
  const drawColumn = (
    title: string,
    lines: PayslipLineItem[],
    totalLabel: string,
    total: number,
    x: number,
    amountColor: ReturnType<typeof rgb>,
  ): number => {
    const labelX = x + 8
    const rightX = x + colW - 8
    const amountText = (amount: number | null) => {
      const s = formatPayslipAmount(amount)
      return s === '-' ? s : `฿${s}`
    }
    let cy = sectionTop
    drawText(title, labelX, cy, 11, c.accent)
    drawHLine(doc, cy - 6, x, x + colW, { thickness: 0.5, color: c.line })
    cy -= 19
    for (const item of lines) {
      const value = amountText(item.amount)
      drawText(item.label, labelX, cy, 9.5, c.mid)
      drawText(value, rightX - widthOf(doc, value, 9.5), cy, 9.5, value === '-' ? c.light : amountColor)
      cy -= 14
      for (const d of item.detail ?? []) {
        drawText(d, labelX + 8, cy + 2, 7.5, c.light)
        cy -= 10
      }
    }
    drawHLine(doc, cy + 6, x, x + colW, { thickness: 0.5, color: c.line })
    cy -= 8
    const totalValue = `฿${fmt(total)}`
    drawText(totalLabel, labelX, cy, 10, c.dark)
    drawText(totalValue, rightX - widthOf(doc, totalValue, 10), cy, 10, c.dark)
    return cy
  }
  const earningsBottom = drawColumn('รายได้', items.earnings, 'รวมรายได้ทั้งหมด', items.totalEarnings, 40, c.green)
  const deductionsBottom = drawColumn('รายการหัก', items.deductions, 'รวมรายการหัก', items.totalDeductions, 40 + colW + colGap, c.red)
  y = Math.min(earningsBottom, deductionsBottom) - 12

  // YTD box (2026-09) — 4 ยอดสะสมสำหรับออกใบรับรองหักภาษี ณ ที่จ่าย 50 ทวิ
  // เรียงคอลัมน์เดียว 4 แถวเรียงบนลงล่าง (แก้ไข 2026-09-21 — เดิมเป็น grid
  // 2x2): รายได้สะสม → ภาษีสะสม → WHT สะสม → ประกันสังคมสะสม ตามลำดับที่ยืนยัน
  if (input.ytd) {
    y -= 10
    drawRect(doc, 40, y - 88, W - 80, 98, { fill: rgb(0.98, 0.97, 0.94) })
    drawText(`ยอดสะสมตั้งแต่ต้นปี (สำหรับ 50 ทวิ) — ถึงเดือน${MONTH_TH[input.month]} ${input.year + 543}`, 52, y - 4, 9, c.accent)
    drawText(`รายได้สะสม: ฿${fmt(input.ytd.income)}`, 52, y - 18, 9, c.mid)
    drawText(`ภาษีสะสม: ฿${fmt(input.ytd.taxNormal)}`, 52, y - 34, 9, c.mid)
    drawText(`WHT สะสม: ฿${fmt(input.ytd.taxOffSystemWht)}`, 52, y - 50, 9, c.mid)
    drawText(`ประกันสังคมสะสม: ฿${fmt(input.ytd.socialSecurity)}`, 52, y - 66, 9, c.mid)
    y -= 98
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
