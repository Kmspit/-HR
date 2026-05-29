import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import type { AttendanceWorkLogRow } from '@/lib/attendance-work-log'

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

const CSV_HEADERS = [
  'วันที่',
  'วัน',
  'เช็คอิน',
  'สถานที่เช็คอิน',
  'เริ่มพัก',
  'จบพัก',
  'เช็คเอาท์',
  'สถานที่เช็คเอาท์',
  'มาสาย(นาที)',
  'กลับก่อน(นาที)',
  'ชั่วโมงทำงาน',
  'สถานะ',
  'ประเภทการลา',
  'หมายเหตุ',
] as const

function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export type WorkLogExportMeta = {
  employeeName: string
  employeeId: string | null
  department: string | null
  month: number
  year: number
  monthLabel: string
  companyName?: string
}

export function buildWorkLogCsv(
  rows: AttendanceWorkLogRow[],
  meta: WorkLogExportMeta,
): Buffer {
  const lines: string[] = []
  lines.push(`รายงานบันทึกลงเวลา,${meta.monthLabel} ${meta.year}`)
  lines.push(
    `พนักงาน,${csvEscape(meta.employeeName)}${meta.employeeId ? ` (${meta.employeeId})` : ''}`,
  )
  if (meta.department) lines.push(`แผนก,${csvEscape(meta.department)}`)
  lines.push('')
  lines.push(CSV_HEADERS.join(','))

  for (const r of rows) {
    lines.push(
      [
        r.dateLabel,
        r.dayLabel,
        r.checkInTime,
        r.checkInPlace ?? '',
        r.lunchOutTime,
        r.lunchInTime,
        r.checkOutTime,
        r.checkOutPlace ?? '',
        r.lateMinutes > 0 ? r.lateMinutes : '',
        r.earlyLeaveMinutes > 0 ? r.earlyLeaveMinutes : '',
        r.workHoursLabel,
        r.statusDisplay,
        r.leaveTypeLabel ?? '',
        r.note ?? '',
      ]
        .map(csvEscape)
        .join(','),
    )
  }

  const body = lines.join('\r\n')
  return Buffer.from('\uFEFF' + body, 'utf-8')
}

function rowToPdfCells(r: AttendanceWorkLogRow): string[] {
  return [
    r.dateLabel,
    r.dayLabel,
    r.checkInTime,
    (r.checkInPlace ?? '—').slice(0, 18),
    r.lunchOutTime,
    r.lunchInTime,
    r.checkOutTime,
    r.statusDisplay,
    r.lateMinutes > 0 ? String(r.lateMinutes) : '—',
    r.workHoursLabel,
  ]
}

const PDF_COL_HEADERS = [
  'วันที่',
  'วัน',
  'เข้า',
  'สถานที่',
  'พักออก',
  'พักเข้า',
  'ออก',
  'สถานะ',
  'สาย',
  'ชม.',
]

export async function buildWorkLogPdf(
  rows: AttendanceWorkLogRow[],
  meta: WorkLogExportMeta,
): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(await loadThaiFontBytes())
  const pageW = 842
  const pageH = 595
  const margin = 28
  const fontSize = 7
  const headerSize = 8
  const rowH = 12
  const colCount = PDF_COL_HEADERS.length
  const colW = (pageW - margin * 2) / colCount

  let page = pdf.addPage([pageW, pageH])
  let y = pageH - margin

  const drawLine = (text: string, x: number, size: number) => {
    const t = text.length > 22 ? `${text.slice(0, 21)}…` : text
    page.drawText(t, { x, y, size, font, color: rgb(0.15, 0.15, 0.2) })
  }

  const newPage = () => {
    page = pdf.addPage([pageW, pageH])
    y = pageH - margin
    drawHeaderRow()
  }

  const drawHeaderRow = () => {
    PDF_COL_HEADERS.forEach((h, i) => {
      page.drawText(h, {
        x: margin + i * colW + 2,
        y,
        size: headerSize,
        font,
        color: rgb(0.2, 0.35, 0.55),
      })
    })
    y -= rowH + 2
  }

  drawLine(`${meta.companyName ?? 'HRFlow'} — บันทึกลงเวลารายเดือน`, margin, 11)
  y -= 14
  drawLine(
    `${meta.employeeName}${meta.employeeId ? ` (${meta.employeeId})` : ''} · ${meta.monthLabel} ${meta.year}`,
    margin,
    9,
  )
  y -= 16
  drawHeaderRow()

  for (const r of rows) {
    if (y < margin + rowH) newPage()
    const cells = rowToPdfCells(r)
    cells.forEach((cell, i) => drawLine(cell, margin + i * colW + 2, fontSize))
    y -= rowH
  }

  if (rows.length === 0) {
    drawLine('ไม่มีข้อมูลในเดือนนี้', margin, fontSize)
  }

  const bytes = await pdf.save()
  return Buffer.from(bytes)
}

export function workLogExportFilename(
  meta: WorkLogExportMeta,
  ext: 'csv' | 'pdf',
): string {
  const slug = meta.employeeId ?? meta.employeeName.replace(/\s+/g, '_').slice(0, 24)
  return `attendance-${meta.year}-${String(meta.month).padStart(2, '0')}-${slug}.${ext}`
}
