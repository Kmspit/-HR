import PDFDocument from 'pdfkit'
import { rgb } from 'pdf-lib'
import { drawText, finalizePdfKitDocument } from '@/lib/pdfkit-compat'
import { loadThaiPdfFontBytes } from '@/lib/thai-pdf-font'

export type WarningPdfInput = {
  companyName: string
  employeeName: string
  employeeId: string | null
  department: string | null
  warningNumber: number
  level: number
  reason: string
  description: string | null
  issuedAt: Date
  issuedByName: string
}

export async function generateWarningPdfBuffer(input: WarningPdfInput): Promise<Buffer> {
  const thaiBytes = await loadThaiPdfFontBytes()
  const doc = new PDFDocument({ size: [595, 842], margin: 0 })
  doc.font(thaiBytes)

  const dateStr = input.issuedAt.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const green = rgb(0.086, 0.639, 0.290) // #16a34a
  const bodyColor = rgb(0.1, 0.1, 0.15)

  let y = 780
  const draw = (text: string, size = 12, color = bodyColor) => {
    const lines = wrapText(text, 70)
    for (const line of lines) {
      drawText(doc, line, 50, y, { size, color })
      y -= size + 8
    }
  }

  draw(input.companyName, 16, green)
  y -= 4
  draw('เอกสารใบเตือนพนักงาน (Warning Letter)', 14, green)
  y -= 12
  draw(`วันที่ออกเอกสาร: ${dateStr}`)
  draw(`ครั้งที่: ${input.warningNumber}  |  ระดับ: ${input.level}`)
  y -= 8
  draw('ข้อมูลพนักงาน', 12, green)
  draw(`ชื่อ: ${input.employeeName}`)
  if (input.employeeId) draw(`รหัสพนักงาน: ${input.employeeId}`)
  if (input.department) draw(`แผนก/ฝ่าย: ${input.department}`)
  y -= 8
  draw('รายละเอียดการเตือน', 12, green)
  draw(`สาเหตุ: ${input.reason}`)
  if (input.description?.trim()) draw(`หมายเหตุ: ${input.description.trim()}`)
  y -= 12
  draw(`ผู้ออกเอกสาร: ${input.issuedByName}`)
  y -= 24
  draw(
    'เอกสารฉบับนี้ออกโดยระบบ HRFlow — กรุณาเก็บรักษาและปฏิบัติตามระเบียบของบริษัท',
    10,
  )

  return finalizePdfKitDocument(doc)
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.replace(/\r\n/g, '\n').split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (next.length > maxChars) {
      if (line) lines.push(line)
      line = w.length > maxChars ? w.slice(0, maxChars) : w
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}
