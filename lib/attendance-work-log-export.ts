import ExcelJS from 'exceljs'
import { PDFDocument, rgb, type PDFPage, type PDFFont, type RGB } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import type { AttendanceWorkLogRow } from '@/lib/attendance-work-log'
import { loadThaiPdfFontBytes } from '@/lib/thai-pdf-font'
type Align = 'left' | 'center' | 'right'
type ExportColDef = {
  key: string
  header: string
  group?: string
  excelWidth: number
  pdfWeight: number
  align: Align
  wrap?: boolean
}
const DATA_COLUMNS: ExportColDef[] = [
  { key: 'date', header: 'วันที่', group: 'วันที่', excelWidth: 11, pdfWeight: 5.5, align: 'center' },
  { key: 'day', header: 'วัน', group: 'วันที่', excelWidth: 9, pdfWeight: 4.5, align: 'center' },
  { key: 'checkIn', header: 'เช็คอิน', group: 'ลงเวลา', excelWidth: 9, pdfWeight: 5, align: 'center' },
  {
    key: 'checkInPlace',
    header: 'สถานที่เช็คอิน',
    group: 'ลงเวลา',
    excelWidth: 28,
    pdfWeight: 11,
    align: 'left',
    wrap: true,
  },
  { key: 'lunchOut', header: 'เริ่มพัก', group: 'พักกลางวัน', excelWidth: 9, pdfWeight: 5, align: 'center' },
  { key: 'lunchIn', header: 'จบพัก', group: 'พักกลางวัน', excelWidth: 9, pdfWeight: 5, align: 'center' },
  { key: 'checkOut', header: 'เช็คเอาท์', group: 'ลงเวลา', excelWidth: 9, pdfWeight: 5, align: 'center' },
  {
    key: 'checkOutPlace',
    header: 'สถานที่เช็คเอาท์',
    group: 'ลงเวลา',
    excelWidth: 28,
    pdfWeight: 11,
    align: 'left',
    wrap: true,
  },
  { key: 'late', header: 'มาสาย (นาที)', group: 'สรุป', excelWidth: 11, pdfWeight: 5.5, align: 'center' },
  { key: 'early', header: 'กลับก่อน (นาที)', group: 'สรุป', excelWidth: 11, pdfWeight: 5.5, align: 'center' },
  { key: 'workHours', header: 'ชั่วโมงทำงาน', group: 'สรุป', excelWidth: 12, pdfWeight: 6.5, align: 'center' },
  { key: 'status', header: 'สถานะ', group: 'สถานะ', excelWidth: 11, pdfWeight: 6, align: 'center' },
  { key: 'leave', header: 'ประเภทการลา', group: 'สถานะ', excelWidth: 14, pdfWeight: 7, align: 'center' },
  { key: 'note', header: 'หมายเหตุ', group: 'อื่นๆ', excelWidth: 22, pdfWeight: 9, align: 'left', wrap: true },
]
const EMPLOYEE_COL: ExportColDef = {
  key: 'employee',
  header: 'พนักงาน',
  group: 'พนักงาน',
  excelWidth: 24,
  pdfWeight: 10,
  align: 'left',
  wrap: true,
}
const EXCEL_BORDER_THIN = {
  top: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
  left: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
  right: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
}
const EXCEL_BORDER_HEADER = {
  top: { style: 'medium' as const, color: { argb: 'FF1E40AF' } },
  bottom: { style: 'medium' as const, color: { argb: 'FF1E40AF' } },
  left: { style: 'thin' as const, color: { argb: 'FF1E3A8A' } },
  right: { style: 'thin' as const, color: { argb: 'FF1E3A8A' } },
}
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
function getColumns(includeEmployee: boolean): ExportColDef[] {
  return includeEmployee ? [EMPLOYEE_COL, ...DATA_COLUMNS] : DATA_COLUMNS
}
function cellText(value: string | number | null | undefined): string {
  if (value == null || value === '' || value === '—') return '-'
  return String(value).trim()
}
function rowCellValues(r: ExportRow, cols: ExportColDef[]): string[] {
  const employee =
    r.employeeName != null
      ? `${r.employeeName}${r.employeeCode ? ` (${r.employeeCode})` : ''}`
      : '-'
  const map: Record<string, string> = {
    employee,
    date: cellText(r.dateLabel),
    day: cellText(r.dayLabel),
    checkIn: cellText(r.checkInTime),
    checkInPlace: cellText(r.checkInPlace),
    lunchOut: cellText(r.lunchOutTime),
    lunchIn: cellText(r.lunchInTime),
    checkOut: cellText(r.checkOutTime),
    checkOutPlace: cellText(r.checkOutPlace),
    late: r.lateMinutes > 0 ? String(r.lateMinutes) : '-',
    early: r.earlyLeaveMinutes > 0 ? String(r.earlyLeaveMinutes) : '-',
    workHours: cellText(r.workHoursLabel),
    status: cellText(r.statusDisplay),
    leave: cellText(r.leaveTypeLabel),
    note: cellText(r.note),
  }
  return cols.map((c) => map[c.key] ?? '-')
}
function excelAlign(a: Align): Partial<ExcelJS.Alignment> {
  return { vertical: 'middle', horizontal: a, wrapText: true }
}
function statusFillArgb(status: string): string | undefined {
  const s = status.toLowerCase()
  if (s.includes('late')) return 'FFFFFBEB'
  if (s.includes('absent')) return 'FFFEF2F2'
  if (s.includes('leave')) return 'FFEFF6FF'
  if (s.includes('half')) return 'FFF5F3FF'
  if (s.includes('early')) return 'FFFFF7ED'
  if (s.includes('present') || s === 'ot') return 'FFF0FDF4'
  return undefined
}
function applyExcelCellStyle(
  cell: ExcelJS.Cell,
  col: ExportColDef,
  opts: { header?: boolean; zebra?: boolean; status?: string },
) {
  cell.alignment = excelAlign(col.align)
  if (opts.header) {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } }
    cell.border = EXCEL_BORDER_HEADER
    return
  }
  cell.font = { size: 10, color: { argb: 'FF0F172A' } }
  cell.numFmt = '@'
  cell.border = EXCEL_BORDER_THIN
  const statusFill = col.key === 'status' ? statusFillArgb(opts.status ?? '') : undefined
  if (statusFill) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusFill } }
    cell.font = { ...cell.font, bold: true }
  } else if (opts.zebra) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
  }
}
/** Excel .xlsx — คอลัมน์แยกชัด มีกลุ่มหัวตาราง */
export async function buildWorkLogXlsx(
  rows: ExportRow[],
  meta: WorkLogExportMeta,
  options?: { includeEmployeeColumn?: boolean },
): Promise<Buffer> {
  const includeEmployee =
    options?.includeEmployeeColumn ?? rows.some((r) => !!r.employeeName)
  const cols = getColumns(includeEmployee)
  const colCount = cols.length
  const wb = new ExcelJS.Workbook()
  wb.creator = 'HRFlow'
  const ws = wb.addWorksheet('บันทึกลงเวลา', {
    views: [{ state: 'frozen', ySplit: 6, activeCell: 'A7' }],
    properties: { defaultRowHeight: 18 },
  })
  const titleRow = 1
  const metaRow2 = 2
  const metaRow3 = meta.department ? 3 : null
  const groupRowNum = meta.department ? 5 : 4
  const headerRowNum = groupRowNum + 1
  const freezeRow = headerRowNum + 1
  ws.mergeCells(titleRow, 1, titleRow, colCount)
  const titleCell = ws.getCell(titleRow, 1)
  titleCell.value = `${meta.companyName ?? 'HRFlow'} — รายงานบันทึกลงเวลา ${meta.monthLabel} ${meta.year}`
  titleCell.font = { bold: true, size: 15, color: { argb: 'FF0F172A' } }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } }
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' }
  ws.getRow(titleRow).height = 28
  ws.mergeCells(metaRow2, 1, metaRow2, colCount)
  ws.getCell(metaRow2, 1).value = `พนักงาน: ${meta.employeeName}${meta.employeeId ? ` · รหัส ${meta.employeeId}` : ''}`
  ws.getCell(metaRow2, 1).font = { size: 11, color: { argb: 'FF334155' } }
  if (metaRow3) {
    ws.mergeCells(metaRow3, 1, metaRow3, colCount)
    ws.getCell(metaRow3, 1).value = `แผนก: ${meta.department}`
    ws.getCell(metaRow3, 1).font = { size: 10, color: { argb: 'FF64748B' } }
  }
  cols.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.excelWidth
  })
  let gStart = 0
  for (let i = 0; i < cols.length; i++) {
    const g = cols[i].group ?? cols[i].header
    const nextG = i + 1 < cols.length ? (cols[i + 1].group ?? cols[i + 1].header) : null
    if (nextG !== g || i === cols.length - 1) {
      const from = gStart + 1
      const to = i + 1
      if (from < to) ws.mergeCells(groupRowNum, from, groupRowNum, to)
      const gCell = ws.getCell(groupRowNum, from)
      gCell.value = g
      gCell.font = { bold: true, size: 9, color: { argb: 'FF1E3A8A' } }
      gCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }
      gCell.alignment = { vertical: 'middle', horizontal: 'center' }
      gCell.border = EXCEL_BORDER_THIN
      gStart = i + 1
    }
  }
  ws.getRow(groupRowNum).height = 20
  const headerRow = ws.getRow(headerRowNum)
  cols.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = col.header
    applyExcelCellStyle(cell, col, { header: true })
  })
  headerRow.height = 24
  ws.views = [{ state: 'frozen', ySplit: freezeRow - 1, activeCell: `A${freezeRow}` }]
  let dataRowNum = headerRowNum + 1
  if (rows.length === 0) {
    ws.mergeCells(dataRowNum, 1, dataRowNum, colCount)
    const c = ws.getCell(dataRowNum, 1)
    c.value = 'ไม่มีข้อมูลในเดือนนี้'
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    c.font = { italic: true, color: { argb: 'FF94A3B8' } }
  } else {
    for (const r of rows) {
      const values = rowCellValues(r, cols)
      const row = ws.getRow(dataRowNum)
      const zebra = dataRowNum % 2 === 0
      cols.forEach((col, i) => {
        const cell = row.getCell(i + 1)
        cell.value = values[i]
        applyExcelCellStyle(cell, col, {
          zebra,
          status: col.key === 'status' ? values[i] : undefined,
        })
        if (col.wrap) cell.alignment = { ...cell.alignment, wrapText: true, vertical: 'top' }
      })
      row.height = values.some((v, i) => cols[i].wrap && v.length > 28) ? 32 : 20
      dataRowNum++
    }
  }
  ws.autoFilter = {
    from: { row: headerRowNum, column: 1 },
    to: { row: Math.max(headerRowNum, dataRowNum - 1), column: colCount },
  }
  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
/** CSV สำรอง */
export function buildWorkLogCsv(
  rows: ExportRow[],
  meta: WorkLogExportMeta,
  options?: { includeEmployeeColumn?: boolean },
): Buffer {
  const includeEmployee =
    options?.includeEmployeeColumn ?? rows.some((r) => !!r.employeeName)
  const cols = getColumns(includeEmployee)
  const sep = ';'
  const quote = (s: string) => `"${s.replace(/"/g, '""')}"`
  const lines: string[] = [
    quote(`รายงานบันทึกลงเวลา ${meta.monthLabel} ${meta.year}`),
    quote(`พนักงาน: ${meta.employeeName}${meta.employeeId ? ` (${meta.employeeId})` : ''}`),
    ...(meta.department ? [quote(`แผนก: ${meta.department}`)] : []),
    '',
    cols.map((c) => quote(c.header)).join(sep),
  ]
  for (const r of rows) {
    lines.push(rowCellValues(r, cols).map(quote).join(sep))
  }
  return Buffer.from('\uFEFF' + lines.join('\r\n'), 'utf-8')
}
function safePdfText(text: string, maxLen: number): string {
  const t = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').trim() || '-'
  return t.length > maxLen ? `${t.slice(0, maxLen - 1)}…` : t
}
function pdfColWidths(cols: ExportColDef[], tableW: number): number[] {
  const total = cols.reduce((s, c) => s + c.pdfWeight, 0)
  return cols.map((c) => (tableW * c.pdfWeight) / total)
}
function pdfStatusBg(status: string): RGB | undefined {
  const s = status.toLowerCase()
  if (s.includes('late')) return rgb(1, 0.98, 0.9)
  if (s.includes('absent')) return rgb(1, 0.95, 0.95)
  if (s.includes('leave')) return rgb(0.94, 0.97, 1)
  if (s.includes('present') || s === 'ot') return rgb(0.94, 0.99, 0.95)
  return undefined
}
type PdfTableCtx = {
  page: PDFPage
  font: PDFFont
  margin: number
  colWidths: number[]
  cols: ExportColDef[]
  rowH: number
  headerH: number
  y: number
}
function drawPdfGridRow(
  ctx: PdfTableCtx,
  values: string[],
  opts: { header?: boolean; fill?: RGB },
) {
  const { page, font, rowH, headerH } = ctx
  const h = opts.header ? headerH : rowH
  const yBottom = ctx.y - h
  let x = ctx.margin
  for (let i = 0; i < ctx.cols.length; i++) {
    const w = ctx.colWidths[i]
    if (opts.fill && !opts.header) {
      page.drawRectangle({ x, y: yBottom, width: w, height: h, color: opts.fill })
    }
    if (opts.header) {
      page.drawRectangle({
        x,
        y: yBottom,
        width: w,
        height: h,
        color: rgb(0.11, 0.31, 0.78),
      })
    }
    page.drawRectangle({
      x,
      y: yBottom,
      width: w,
      height: h,
      borderColor: rgb(0.75, 0.8, 0.86),
      borderWidth: 0.5,
    })
    const text = safePdfText(values[i] ?? '-', opts.header ? 18 : 36)
    const size = opts.header ? 6.5 : 6
    const tw = font.widthOfTextAtSize(text, size)
    const col = ctx.cols[i]
    let tx = x + 3
    if (col.align === 'center') tx = x + Math.max(3, (w - tw) / 2)
    else if (col.align === 'right') tx = x + Math.max(3, w - tw - 3)
    page.drawText(text, {
      x: tx,
      y: yBottom + (h - size) / 2 - 1,
      size,
      font,
      color: opts.header ? rgb(1, 1, 1) : rgb(0.1, 0.12, 0.16),
    })
    x += w
  }
  ctx.y = yBottom - 1
}
function drawPdfGroupRow(ctx: PdfTableCtx) {
  const h = 14
  const yBottom = ctx.y - h
  let gStart = 0
  let x = ctx.margin
  for (let i = 0; i < ctx.cols.length; i++) {
    const g = ctx.cols[i].group ?? ctx.cols[i].header
    const nextG = i + 1 < ctx.cols.length ? (ctx.cols[i + 1].group ?? ctx.cols[i + 1].header) : null
    if (nextG !== g || i === ctx.cols.length - 1) {
      const segW = ctx.colWidths.slice(gStart, i + 1).reduce((a, b) => a + b, 0)
      pageDrawGroupCell(ctx.page, x, yBottom, segW, h, g, ctx.font)
      x += segW
      gStart = i + 1
    }
  }
  ctx.y = yBottom - 2
}
function pageDrawGroupCell(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  font: PDFFont,
) {
  page.drawRectangle({ x, y, width: w, height: h, color: rgb(0.86, 0.92, 0.98) })
  page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(0.7, 0.78, 0.88), borderWidth: 0.5 })
  const text = safePdfText(label, 20)
  const size = 6
  const tw = font.widthOfTextAtSize(text, size)
  page.drawText(text, {
    x: x + (w - tw) / 2,
    y: y + (h - size) / 2,
    size,
    font,
    color: rgb(0.12, 0.23, 0.55),
  })
}
export async function buildWorkLogPdf(
  rows: ExportRow[],
  meta: WorkLogExportMeta,
  options?: { includeEmployeeColumn?: boolean },
): Promise<Buffer> {
  const includeEmployee =
    options?.includeEmployeeColumn ?? rows.some((r) => !!r.employeeName)
  const cols = getColumns(includeEmployee)
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const fontBytes = await loadThaiPdfFontBytes()
  const font = await pdf.embedFont(fontBytes)
  const pageW = 1684
  const pageH = 1190
  const margin = 28
  const tableW = pageW - margin * 2
  const colWidths = pdfColWidths(cols, tableW)
  const rowH = 16
  const headerH = 20
  let page = pdf.addPage([pageW, pageH])
  let y = pageH - margin
  const drawTitle = (p: PDFPage, yy: number) => {
    p.drawText(safePdfText(`${meta.companyName ?? 'HRFlow'} — บันทึกลงเวลารายเดือน`, 80), {
      x: margin,
      y: yy,
      size: 13,
      font,
      color: rgb(0.06, 0.09, 0.16),
    })
  }
  drawTitle(page, y)
  y -= 18
  page.drawText(
    safePdfText(
      `${meta.employeeName}${meta.employeeId ? ` (${meta.employeeId})` : ''} · ${meta.monthLabel} ${meta.year}`,
      100,
    ),
    { x: margin, y, size: 10, font, color: rgb(0.25, 0.3, 0.35) },
  )
  y -= meta.department ? 26 : 16
  if (meta.department) {
    page.drawText(safePdfText(`แผนก: ${meta.department}`, 60), {
      x: margin,
      y: y + 10,
      size: 9,
      font,
      color: rgb(0.45, 0.5, 0.55),
    })
  }
  y -= 8
  const makeCtx = (): PdfTableCtx => ({
    page,
    font,
    margin,
    colWidths,
    cols,
    rowH,
    headerH,
    y,
  })
  let ctx = makeCtx()
  drawPdfGroupRow(ctx)
  drawPdfGridRow(
    ctx,
    cols.map((c) => c.header),
    { header: true },
  )
  y = ctx.y
  const startTableOnNewPage = () => {
    page = pdf.addPage([pageW, pageH])
    y = pageH - margin - 8
    ctx = { ...makeCtx(), page, y }
    drawPdfGroupRow(ctx)
    drawPdfGridRow(ctx, cols.map((c) => c.header), { header: true })
    y = ctx.y
  }
  let rowIndex = 0
  for (const r of rows) {
    if (y < margin + rowH + headerH + 20) {
      startTableOnNewPage()
    }
    ctx.y = y
    const values = rowCellValues(r, cols)
    const statusVal = values[cols.findIndex((c) => c.key === 'status')]
    drawPdfGridRow(ctx, values, {
      fill: rowIndex % 2 === 1 ? rgb(0.98, 0.99, 1) : pdfStatusBg(statusVal),
    })
    y = ctx.y
    rowIndex++
  }
  if (rows.length === 0) {
    const emptyH = 28
    const yBottom = y - emptyH
    page.drawRectangle({
      x: margin,
      y: yBottom,
      width: tableW,
      height: emptyH,
      color: rgb(0.98, 0.99, 1),
      borderColor: rgb(0.75, 0.8, 0.86),
      borderWidth: 0.5,
    })
    const msg = safePdfText('ไม่มีข้อมูลในเดือนนี้', 40)
    const size = 10
    const tw = font.widthOfTextAtSize(msg, size)
    page.drawText(msg, {
      x: margin + (tableW - tw) / 2,
      y: yBottom + (emptyH - size) / 2,
      size,
      font,
      color: rgb(0.55, 0.6, 0.65),
    })
  }
  const bytes = await pdf.save()
  const buf = Buffer.from(bytes)
  if (buf.length < 100 || buf.subarray(0, 4).toString() !== '%PDF') {
    throw new Error('สร้าง PDF ไม่สมบูรณ์')
  }
  return buf
}
