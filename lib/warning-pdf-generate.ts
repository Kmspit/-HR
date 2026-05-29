import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const THAI_FONT_URL =
  'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-thai@5.2.8/files/noto-sans-thai-400-normal.ttf'

let cachedThaiFontBytes: ArrayBuffer | null = null

async function loadThaiFontBytes(): Promise<ArrayBuffer> {
  if (cachedThaiFontBytes) return cachedThaiFontBytes
  const res = await fetch(THAI_FONT_URL)
  if (!res.ok) throw new Error('โหลดฟอนต์ไทยสำหรับ PDF ไม่สำเร็จ')
  cachedThaiFontBytes = await res.arrayBuffer()
  return cachedThaiFontBytes
}

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
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const thaiBytes = await loadThaiFontBytes()
  const font = await pdf.embedFont(thaiBytes)
  const fontBold = font
  const page = pdf.addPage([595, 842])

  const dateStr = input.issuedAt.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  let y = 780
  const draw = (text: string, size = 12, bold = false) => {
    const lines = wrapText(text, 70)
    for (const line of lines) {
      page.drawText(line, {
        x: 50,
        y,
        size,
        font: bold ? fontBold : font,
        color: rgb(0.1, 0.1, 0.15),
      })
      y -= size + 8
    }
  }

  draw(input.companyName, 16, true)
  y -= 4
  draw('เอกสารใบเตือนพนักงาน (Warning Letter)', 14, true)
  y -= 12
  draw(`วันที่ออกเอกสาร: ${dateStr}`)
  draw(`ครั้งที่: ${input.warningNumber}  |  ระดับ: ${input.level}`)
  y -= 8
  draw('ข้อมูลพนักงาน', 12, true)
  draw(`ชื่อ: ${input.employeeName}`)
  if (input.employeeId) draw(`รหัสพนักงาน: ${input.employeeId}`)
  if (input.department) draw(`แผนก/ฝ่าย: ${input.department}`)
  y -= 8
  draw('รายละเอียดการเตือน', 12, true)
  draw(`สาเหตุ: ${input.reason}`)
  if (input.description?.trim()) draw(`หมายเหตุ: ${input.description.trim()}`)
  y -= 12
  draw(`ผู้ออกเอกสาร: ${input.issuedByName}`)
  y -= 24
  draw(
    'เอกสารฉบับนี้ออกโดยระบบ HRFlow — กรุณาเก็บรักษาและปฏิบัติตามระเบียบของบริษัท',
    10,
  )

  const bytes = await pdf.save()
  return Buffer.from(bytes)
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
