import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { loadThaiPdfFontBytes } from '@/lib/thai-pdf-font'
import { formatLateMinutes } from '@/lib/utils'

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
  netSalary: number
  lateDays: number
  absentDays: number
  lateMinutes: number
  taxDetail?: {
    annualGross?: number
    taxableIncome?: number
    annualTax?: number
    monthlyWithholding?: number
  } | null
}

const MONTH_TH = [
  '',
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

function fmt(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export async function generateSalarySlipPdf(input: SalarySlipInput): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const thaiBytes = await loadThaiPdfFontBytes()
  const font = await pdf.embedFont(thaiBytes)

  const W = 595
  const H = 842
  const page = pdf.addPage([W, H])
  const c = { dark: rgb(0.1, 0.1, 0.15), mid: rgb(0.35, 0.35, 0.4), light: rgb(0.6, 0.6, 0.65), green: rgb(0.1, 0.55, 0.3), red: rgb(0.75, 0.15, 0.15), accent: rgb(0.1, 0.35, 0.7), white: rgb(1, 1, 1), line: rgb(0.85, 0.85, 0.9) }

  const drawText = (text: string, x: number, y: number, size: number, color = c.dark) => {
    page.drawText(text, { x, y, size, font, color })
  }

  const drawLine = (y: number, x1 = 40, x2 = W - 40) => {
    page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.5, color: c.line })
  }

  const row = (label: string, value: string, y: number, valueColor = c.dark) => {
    drawText(label, 60, y, 10, c.mid)
    drawText(value, W - 60 - font.widthOfTextAtSize(value, 10), y, 10, valueColor)
  }

  // Header bar
  page.drawRectangle({ x: 0, y: H - 70, width: W, height: 70, color: c.accent })
  drawText(input.companyName, 40, H - 38, 13, c.white)
  drawText('สลิปเงินเดือน (Salary Slip)', 40, H - 58, 10, rgb(0.75, 0.85, 1))

  const periodLabel = `${MONTH_TH[input.month]} ${input.year + 543}`
  const periodW = font.widthOfTextAtSize(periodLabel, 12)
  drawText(periodLabel, W - 40 - periodW, H - 44, 12, c.white)

  // Employee info box
  let y = H - 100
  page.drawRectangle({ x: 40, y: y - 54, width: W - 80, height: 64, color: rgb(0.97, 0.97, 1) })
  drawText('ข้อมูลพนักงาน', 52, y - 4, 9, c.accent)
  drawText(input.employeeName, 52, y - 20, 12, c.dark)
  const empMeta = [input.employeeId ? `รหัส: ${input.employeeId}` : null, input.department ?? null, input.position ?? null].filter(Boolean).join('  ·  ')
  if (empMeta) drawText(empMeta, 52, y - 36, 9, c.mid)

  // Section: รายได้
  y = H - 182
  drawText('รายได้', 60, y, 11, c.accent)
  drawLine(y - 6)
  y -= 20
  row('เงินเดือนฐาน', `฿${fmt(input.baseSalary)}`, y)
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
  if (input.lateDeduction === 0 && input.absentDeduction === 0 && input.unpaidLeave === 0 && input.socialSecurity === 0 && input.taxDeduction === 0 && input.otherDeduction === 0) {
    drawText('ไม่มีรายการหัก', 60, y, 10, c.light)
    y -= 16
  }

  // Tax detail box
  if (input.taxDetail && input.taxDeduction > 0) {
    y -= 10
    page.drawRectangle({ x: 40, y: y - 56, width: W - 80, height: 66, color: rgb(0.96, 0.98, 1) })
    drawText('รายละเอียดภาษี (ภงด1)', 52, y - 4, 9, c.accent)
    const td = input.taxDetail
    if (td.annualGross) { drawText(`รายได้รวมปีละ: ฿${fmt(td.annualGross)}`, 52, y - 18, 9, c.mid); }
    if (td.taxableIncome) { drawText(`เงินได้สุทธิ: ฿${fmt(td.taxableIncome)}`, 200, y - 18, 9, c.mid); }
    if (td.annualTax) { drawText(`ภาษีรายปี: ฿${fmt(td.annualTax)}`, 350, y - 18, 9, c.mid); }
    drawText(`ภาษีรายเดือน (หัก ณ ที่จ่าย): ฿${fmt(input.taxDeduction)}`, 52, y - 34, 9, c.mid)
    y -= 66
  }

  // Net salary
  y -= 14
  drawLine(y + 10)
  page.drawRectangle({ x: 40, y: y - 32, width: W - 80, height: 42, color: rgb(0.94, 0.99, 0.96) })
  drawText('เงินเดือนสุทธิ (Net Salary)', 60, y - 4, 11, c.dark)
  const netStr = `฿${fmt(input.netSalary)}`
  const netW = font.widthOfTextAtSize(netStr, 16)
  drawText(netStr, W - 60 - netW, y - 6, 16, c.green)

  // Footer
  const footerY = 40
  drawLine(footerY + 18)
  drawText('เอกสารนี้ออกโดยระบบ HRFlow — โปรดเก็บรักษาไว้เป็นหลักฐาน', 40, footerY + 4, 8, c.light)
  const dateStr = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
  drawText(`วันที่พิมพ์: ${dateStr}`, W - 40 - font.widthOfTextAtSize(`วันที่พิมพ์: ${dateStr}`, 8), footerY + 4, 8, c.light)

  const bytes = await pdf.save()
  return Buffer.from(bytes)
}
