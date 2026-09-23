import ExcelJS from 'exceljs'
import { formatDateDdMmYyyyBangkok, formatTimeBangkok, bangkokDateKey, startOfDayBangkok } from '@/lib/datetime-bangkok'

/**
 * Excel backdated-attendance import (2026-09-22 plan, approved) — reads the
 * SAME column format the existing work-log export produces (lib/attendance-
 * work-log-export.ts), so a file HR exported once and hand-corrected/filled
 * in on paper can be re-uploaded as-is. Per the approved rules:
 *   1) Only 6 "raw" columns are ever read: พนักงาน, วันที่, เช็คอิน, เช็คเอาท์,
 *      เริ่มพัก, จบพัก. มาสาย/กลับก่อน/ชั่วโมงทำงาน/สถานะ/ประเภทการลา/หมายเหตุ are
 *      never read even if present — those get recomputed in the validate step
 *      (lib/attendance-import-validate.ts) using the exact same formulas a
 *      real face-scan check-in/out uses (lib/attendance-time-calc.ts).
 * This file is pure parsing (no DB access) — every function here is a plain
 * string → value transform, deliberately kept separate from the DB-touching
 * validate step so both halves stay independently testable.
 */

/** Matches lib/attendance-work-log-export.ts's employee-cell format exactly:
 *  `${employeeName}${employeeCode ? ` (${employeeCode})` : ''}` — e.g.
 *  "สมชาย ใจดี (E001)". A name with no trailing "(code)" parses with
 *  code: null (caller decides whether that's fatal for the row). */
export function parseEmployeeCell(raw: string): { name: string; code: string | null } {
  const trimmed = raw.trim()
  const match = trimmed.match(/^(.+?)\s*\(([^()]+)\)\s*$/)
  if (!match) return { name: trimmed, code: null }
  return { name: match[1].trim(), code: match[2].trim() }
}

/** "-" is this workbook format's blank-cell marker (see cellText() in the
 *  export file) — treated as "not entered", same as an empty string. */
function isBlankCell(raw: string): boolean {
  const t = raw.trim()
  return t === '' || t === '-' || t === '—'
}

/** Parses "DD/MM/YYYY" (formatDateDdMmYyyyBangkok's exact output — Gregorian
 *  year, NOT Buddhist era) into the same "midnight Bangkok" Date shape
 *  Attendance.date uses elsewhere (see startOfDayBangkok). Also tolerates
 *  Excel having auto-converted the cell to a real date (exceljs then gives
 *  us a JS Date instead of a string) by reformatting it through the same
 *  DD/MM/YYYY parser, so both paths produce an identical Bangkok-normalized
 *  result regardless of how the specific cell was typed. */
export function parseImportDateCell(raw: string | Date): Date | null {
  const text = raw instanceof Date ? formatDateDdMmYyyyBangkok(raw) : raw.trim()
  if (!text || isBlankCell(text)) return null
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return null
  const [, ddStr, mmStr, yyyyStr] = match
  const dd = Number(ddStr)
  const mm = Number(mmStr)
  const yyyy = Number(yyyyStr)
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
  const iso = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
  const date = startOfDayBangkok(new Date(`${iso}T00:00:00+07:00`))
  // Reject e.g. 31/02/2026 — Date rolls invalid days into the next month,
  // so re-derive the date-key and compare instead of trusting getMonth().
  if (bangkokDateKey(date) !== iso) return null
  return date
}

/** Parses "HH:mm" (formatTimeBangkok's exact output, 24-hour th-TH locale)
 *  combined with the row's already-parsed date, into a real Date at that
 *  Bangkok time — same `${dateKey}T${time}:00+07:00` construction used
 *  throughout (checkin/checkout routes, lib/attendance-time-calc.ts).
 *  Also tolerates Excel having auto-converted the cell to a real
 *  date-with-time value. */
export function parseImportTimeCell(raw: string | Date, dateKey: string): Date | null {
  const text = raw instanceof Date ? formatTimeBangkok(raw) : raw.trim()
  if (!text || isBlankCell(text)) return null
  const match = text.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const [, hhStr, mmStr] = match
  const hh = Number(hhStr)
  const mm = Number(mmStr)
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  const d = new Date(`${dateKey}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+07:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

export type AttendanceImportRawRow = {
  /** 1-based, matching the actual Excel row number (header row = 1) — shown
   *  to HR in the skip report so they can find the exact row to fix. */
  rowNumber: number
  employeeCell: string
  employeeName: string
  employeeCode: string | null
  dateCell: string
  date: Date | null
  checkInCell: string
  checkIn: Date | null
  checkOutCell: string
  checkOut: Date | null
  lunchOutCell: string
  lunchOut: Date | null
  lunchInCell: string
  lunchIn: Date | null
  /** Structural parse problems found for THIS row (bad date format, missing
   *  employee code, etc.) — validate step turns these into skip reasons. */
  parseErrors: string[]
}

const REQUIRED_HEADERS = {
  employee: 'พนักงาน',
  date: 'วันที่',
  checkIn: 'เช็คอิน',
  checkOut: 'เช็คเอาท์',
  lunchOut: 'เริ่มพัก',
  lunchIn: 'จบพัก',
} as const

function cellString(cell: ExcelJS.Cell): string {
  const v = cell.value
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString() // caller-specific parsers handle Date via their own overload; this path is for header matching only
  if (typeof v === 'object' && 'text' in v) return String((v as { text: unknown }).text ?? '')
  return String(v).trim()
}

export type ParsedAttendanceImportWorkbook =
  | { ok: true; rows: AttendanceImportRawRow[] }
  | { ok: false; headerError: string }

/** Reads the uploaded .xlsx buffer and returns one AttendanceImportRawRow per
 *  data row (row 2 onward) — pure parsing, no DB access. Column order is NOT
 *  assumed to match the export exactly; columns are located by matching each
 *  required header's Thai text (case/whitespace-tolerant), so a file with
 *  extra/reordered non-required columns (as long as the 6 required headers
 *  are all present somewhere in row 1) still parses. */
export async function parseAttendanceImportWorkbook(buffer: ArrayBuffer | Buffer): Promise<ParsedAttendanceImportWorkbook> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as ArrayBuffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) return { ok: false, headerError: 'ไม่พบชีทข้อมูลในไฟล์ที่อัปโหลด' }

  const headerRow = sheet.getRow(1)
  const colIndex: Partial<Record<keyof typeof REQUIRED_HEADERS, number>> = {}
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const text = cellString(cell).trim()
    for (const [key, label] of Object.entries(REQUIRED_HEADERS)) {
      if (text === label) colIndex[key as keyof typeof REQUIRED_HEADERS] = colNumber
    }
  })

  const missing = Object.entries(REQUIRED_HEADERS)
    .filter(([key]) => colIndex[key as keyof typeof REQUIRED_HEADERS] == null)
    .map(([, label]) => label)
  if (missing.length > 0) {
    return { ok: false, headerError: `ไม่พบคอลัมน์ที่จำเป็นในแถวหัวตาราง: ${missing.join(', ')}` }
  }

  const rows: AttendanceImportRawRow[] = []
  const lastRow = sheet.rowCount
  for (let rowNumber = 2; rowNumber <= lastRow; rowNumber++) {
    const row = sheet.getRow(rowNumber)
    const getCell = (key: keyof typeof REQUIRED_HEADERS) => row.getCell(colIndex[key]!)
    const employeeCellRaw = getCell('employee')
    const dateCellRaw = getCell('date')
    const checkInCellRaw = getCell('checkIn')
    const checkOutCellRaw = getCell('checkOut')
    const lunchOutCellRaw = getCell('lunchOut')
    const lunchInCellRaw = getCell('lunchIn')

    // A row where every required cell is blank isn't a data row at all (e.g.
    // a leftover blank row before the sheet's real end) — skip it silently,
    // not as a reported error. `row.actualCellCount` isn't reliable for this:
    // exceljs still counts a cell as "set" for an explicitly-written empty
    // string, so a row built from an all-'' array (as tests do) would not be
    // caught by that check.
    const allRequiredBlank = [employeeCellRaw, dateCellRaw, checkInCellRaw, checkOutCellRaw, lunchOutCellRaw, lunchInCellRaw]
      .every((cell) => isBlankCell(cellString(cell)))
    if (allRequiredBlank) continue

    const employeeCellText = cellString(employeeCellRaw)
    const { name: employeeName, code: employeeCode } = parseEmployeeCell(employeeCellText)

    const parseErrors: string[] = []
    if (isBlankCell(employeeCellText)) parseErrors.push('ไม่มีข้อมูลพนักงาน')
    else if (!employeeCode) parseErrors.push('ไม่พบรหัสพนักงานในวงเล็บ (เช่น "ชื่อ-สกุล (EMP123456)")')

    const dateValue = dateCellRaw.value instanceof Date ? dateCellRaw.value : cellString(dateCellRaw)
    const date = parseImportDateCell(dateValue)
    if (!isBlankCell(cellString(dateCellRaw)) && !date) parseErrors.push(`รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น DD/MM/YYYY): "${cellString(dateCellRaw)}"`)
    if (isBlankCell(cellString(dateCellRaw))) parseErrors.push('ไม่มีวันที่')

    const dateKey = date ? bangkokDateKey(date) : ''
    const checkInValue = checkInCellRaw.value instanceof Date ? checkInCellRaw.value : cellString(checkInCellRaw)
    const checkOutValue = checkOutCellRaw.value instanceof Date ? checkOutCellRaw.value : cellString(checkOutCellRaw)
    const lunchOutValue = lunchOutCellRaw.value instanceof Date ? lunchOutCellRaw.value : cellString(lunchOutCellRaw)
    const lunchInValue = lunchInCellRaw.value instanceof Date ? lunchInCellRaw.value : cellString(lunchInCellRaw)

    const checkIn = date ? parseImportTimeCell(checkInValue, dateKey) : null
    const checkOut = date ? parseImportTimeCell(checkOutValue, dateKey) : null
    const lunchOut = date ? parseImportTimeCell(lunchOutValue, dateKey) : null
    const lunchIn = date ? parseImportTimeCell(lunchInValue, dateKey) : null

    if (date && !isBlankCell(cellString(checkInCellRaw)) && !checkIn) parseErrors.push(`รูปแบบเวลาเช็คอินไม่ถูกต้อง (ต้องเป็น HH:mm): "${cellString(checkInCellRaw)}"`)
    if (date && !isBlankCell(cellString(checkOutCellRaw)) && !checkOut) parseErrors.push(`รูปแบบเวลาเช็คเอาท์ไม่ถูกต้อง (ต้องเป็น HH:mm): "${cellString(checkOutCellRaw)}"`)
    if (date && isBlankCell(cellString(checkInCellRaw))) parseErrors.push('ไม่มีเวลาเช็คอิน')

    rows.push({
      rowNumber,
      employeeCell: employeeCellText,
      employeeName,
      employeeCode,
      dateCell: cellString(dateCellRaw),
      date,
      checkInCell: cellString(checkInCellRaw),
      checkIn,
      checkOutCell: cellString(checkOutCellRaw),
      checkOut,
      lunchOutCell: cellString(lunchOutCellRaw),
      lunchOut,
      lunchInCell: cellString(lunchInCellRaw),
      lunchIn,
      parseErrors,
    })
  }

  return { ok: true, rows }
}
