import ExcelJS from 'exceljs'
import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import type { AttendanceWorkLogRow } from '@/lib/attendance-work-log'
import { loadThaiPdfFontBytes } from '@/lib/thai-pdf-font'

const EXPORT_HEADERS = [
  'วันที่',
  'วัน',
  'เช็คอิน',
  'สถานที่เช็คอิน',
  'เริ่มพัก',
  'จบพัก',
  'เช็คเอาท์',
  'สถานที่เช็คเอาท์',
  'มาสาย (นาที)',
  'กลับก่อน (นาที)',
  'ชั่วโมงทำงาน',
  'สถานะ',
  'ประเภทการลา',
  'หมายเหตุ',
] as const

type ExportRow = AttendanceWorkLogRow & {
  employeeName?: string
  employeeCode?: string | null
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

function cellText(value: string | number | null | undefined): string {
  if (value == null || value === '' || value === '—') return '-'
  return String(value).trim()
}

function rowToExportCells(r: ExportRow, includeEmployee: boolean): string[] {
  const employee =
    includeEmployee && r.employeeName
      ? `${r.employeeName}${r.employeeCode ? ` (${r.employeeCode})` : ''}`
      : null
  return [
    ...(employee != null ? [employee] : []),
    cellText(r.dateLabel),
    cellText(r.dayLabel),
    cellText(r.checkInTime),
    cellText(r.checkInPlace),
    cellText(r.lunchOutTime),
    cellText(r.lunchInTime),
    cellText(r.checkOutTime),
    cellText(r.checkOutPlace),
    r.lateMinutes > 0 ? String(r.lateMinutes) : '-',
    r.earlyLeaveMinutes > 0 ? String(r.earlyLeaveMinutes) : '-',
    cellText(r.workHoursLabel),
    cellText(r.statusDisplay),
    cellText(r.leaveTypeLabel),
    cellText(r.note),
  ]
}

/** Excel .xlsx — เปิดใน Excel ได้สวยงาม ไม่มี ####### */
export async function buildWorkLogXlsx(
  rows: ExportRow[],
  meta: WorkLogExportMeta,
  options?: { includeEmployeeColumn?: boolean },
): Promise<Buffer> {
  const includeEmployee =
    options?.includeEmployeeColumn ?? rows.some((r) => !!r.employeeName)
  const headers = includeEmployee ? ['พนักงาน', ...EXPORT_HEADERS] : [...EXPORT_HEADERS]

  const wb = new ExcelJS.Workbook()
  wb.creator = 'HRFlow'
  const ws = wb.addWorksheet('บันทึกลงเวลา', {
    views: [{ state: 'frozen', ySplit: 5 }],
  })

  ws.mergeCells(1, 1, 1, headers.length)
  ws.getCell(1, 1).value = `${meta.companyName ?? 'HRFlow'} — รายงานบันทึกลงเวลา ${meta.monthLabel} ${meta.year}`
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FF1E3A5F' } }
  ws.getCell(1, 1).alignment = { vertical: 'middle', horizontal: 'left' }

  ws.mergeCells(2, 1, 2, headers.length)
  ws.getCell(2, 1).value = `พนักงาน: ${meta.employeeName}${meta.employeeId ? ` (${meta.employeeId})` : ''}`
  ws.getCell(2, 1).font = { size: 11 }

  if (meta.department) {
    ws.mergeCells(3, 1, 3, headers.length)
    ws.getCell(3, 1).value = `แผนก: ${meta.department}`
    ws.getCell(3, 1).font = { size: 11, color: { argb: 'FF64748B' } }
  }

  const headerRowNum = meta.department ? 5 : 4
  const headerRow = ws.getRow(headerRowNum)
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = h
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' },
    }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    }
  })
  headerRow.height = 22

  const colWidths = includeEmployee
    ? [28, 12, 10, 10, 36, 10, 10, 10, 36, 12, 12, 14, 14, 16, 20]
    : [12, 10, 10, 36, 10, 10, 10, 36, 12, 12, 14, 14, 16, 20]
  colWidths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w
  })

  let dataRowNum = headerRowNum + 1
  if (rows.length === 0) {
    const row = ws.getRow(dataRowNum)
    ws.mergeCells(dataRowNum, 1, dataRowNum, headers.length)
    row.getCell(1).value = 'ไม่มีข้อมูลในเดือนนี้'
    row.getCell(1).alignment = { horizontal: 'center' }
  } else {
    for (const r of rows) {
      const row = ws.getRow(dataRowNum)
      const cells = rowToExportCells(r, includeEmployee)
      cells.forEach((val, i) => {
        const cell = row.getCell(i + 1)
        cell.value = val
        cell.numFmt = '@'
        cell.alignment = { vertical: 'top', wrapText: i === (includeEmployee ? 4 : 3) || i === (includeEmployee ? 8 : 7) }
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        }
        if (dataRowNum % 2 === 0) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF8FAFC' },
          }
        }
      })
      row.height = 18
      dataRowNum++
    }
  }

  ws.autoFilter = {
    from: { row: headerRowNum, column: 1 },
    to: { row: Math.max(headerRowNum, dataRowNum - 1), column: headers.length },
  }

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}

/** CSV สำรอง — ทุกช่องใส่เครื่องหมายคำพูด, คั่นด้วย ; สำหรับ Excel ไทย */
export function buildWorkLogCsv(
  rows: ExportRow[],
  meta: WorkLogExportMeta,
  options?: { includeEmployeeColumn?: boolean },
): Buffer {
  const includeEmployee =
    options?.includeEmployeeColumn ?? rows.some((r) => !!r.employeeName)
  const sep = ';'
  const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

  const headers = includeEmployee ? ['พนักงาน', ...EXPORT_HEADERS] : [...EXPORT_HEADERS]
  const lines: string[] = [
    quote(`รายงานบันทึกลงเวลา ${meta.monthLabel} ${meta.year}`),
    quote(`พนักงาน: ${meta.employeeName}${meta.employeeId ? ` (${meta.employeeId})` : ''}`),
    ...(meta.department ? [quote(`แผนก: ${meta.department}`)] : []),
    '',
    headers.map(quote).join(sep),
  ]

  for (const r of rows) {
    lines.push(rowToExportCells(r, includeEmployee).map(quote).join(sep))
  }

  return Buffer.from('\uFEFF' + lines.join('\r\n'), 'utf-8')
}

function safePdfText(text: string, maxLen: number): string {
  const t = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').trim() || '-'
  return t.length > maxLen ? `${t.slice(0, maxLen - 1)}…` : t
}

export async function buildWorkLogPdf(
  rows: ExportRow[],
  meta: WorkLogExportMeta,
  options?: { includeEmployeeColumn?: boolean },
): Promise<Buffer> {
  const includeEmployee =
    options?.includeEmployeeColumn ?? rows.some((r) => !!r.employeeName)

  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const fontBytes = await loadThaiPdfFontBytes()
  const font = await pdf.embedFont(fontBytes)

  const pageW = 1190
  const pageH = 842
  const margin = 24
  const fontSize = 7
  const headerSize = 7.5
  const rowH = 13

  const pdfHeaders = includeEmployee
    ? ['พนักงาน', ...EXPORT_HEADERS]
    : [...EXPORT_HEADERS]
  const colCount = pdfHeaders.length
  const colW = (pageW - margin * 2) / colCount

  let page = pdf.addPage([pageW, pageH])
  let y = pageH - margin

  const drawText = (text: string, x: number, size: number, color = rgb(0.12, 0.14, 0.18)) => {
    page.drawText(safePdfText(text, 42), { x, y, size, font, color })
  }

  const drawHeaderRow = () => {
    pdfHeaders.forEach((h, i) => {
      page.drawRectangle({
        x: margin + i * colW,
        y: y - 2,
        width: colW,
        height: rowH + 2,
        color: rgb(0.15, 0.39, 0.92),
      })
      page.drawText(safePdfText(h, 24), {
        x: margin + i * colW + 2,
        y,
        size: headerSize,
        font,
        color: rgb(1, 1, 1),
      })
    })
    y -= rowH + 4
  }

  const newPage = () => {
    page = pdf.addPage([pageW, pageH])
    y = pageH - margin
    drawHeaderRow()
  }

  drawText(`${meta.companyName ?? 'HRFlow'} — บันทึกลงเวลารายเดือน`, margin, 12)
  y -= 16
  drawText(
    `${meta.employeeName}${meta.employeeId ? ` (${meta.employeeId})` : ''} · ${meta.monthLabel} ${meta.year}`,
    margin,
    10,
  )
  if (meta.department) {
    y -= 12
    drawText(`แผนก: ${meta.department}`, margin, 9, rgb(0.4, 0.45, 0.5))
  }
  y -= 14
  drawHeaderRow()

  for (const r of rows) {
    if (y < margin + rowH * 2) newPage()
    const cells = rowToExportCells(r, includeEmployee)
    cells.forEach((cell, i) => drawText(cell, margin + i * colW + 2, fontSize))
    y -= rowH
  }

  if (rows.length === 0) {
    drawText('ไม่มีข้อมูลในเดือนนี้', margin, fontSize)
  }

  const bytes = await pdf.save()
  const buf = Buffer.from(bytes)
  if (buf.length < 100 || buf.subarray(0, 4).toString() !== '%PDF') {
    throw new Error('สร้าง PDF ไม่สมบูรณ์')
  }
  return buf
}
