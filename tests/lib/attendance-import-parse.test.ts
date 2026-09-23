import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import {
  parseEmployeeCell,
  parseImportDateCell,
  parseImportTimeCell,
  parseAttendanceImportWorkbook,
} from '@/lib/attendance-import-parse'
import { buildWorkLogXlsx, type WorkLogExportMeta } from '@/lib/attendance-work-log-export'
import type { AttendanceWorkLogRow } from '@/lib/attendance-work-log'

describe('parseEmployeeCell', () => {
  it('splits "name (CODE)" into name + code, matching the export format exactly', () => {
    expect(parseEmployeeCell('สมชาย ใจดี (E001)')).toEqual({ name: 'สมชาย ใจดี', code: 'E001' })
  })

  it('trims extra whitespace around name and code', () => {
    expect(parseEmployeeCell('  สมชาย ใจดี   ( E001 )  ')).toEqual({ name: 'สมชาย ใจดี', code: 'E001' })
  })

  it('returns code: null when there is no trailing "(code)"', () => {
    expect(parseEmployeeCell('สมชาย ใจดี')).toEqual({ name: 'สมชาย ใจดี', code: null })
  })

  it('uses the LAST parenthesized group when the name itself contains parentheses', () => {
    expect(parseEmployeeCell('สมชาย (นามแฝง) ใจดี (E001)')).toEqual({ name: 'สมชาย (นามแฝง) ใจดี', code: 'E001' })
  })
})

describe('parseImportDateCell', () => {
  it('parses "DD/MM/YYYY" (Gregorian, matching formatDateDdMmYyyyBangkok exactly)', () => {
    const d = parseImportDateCell('23/09/2026')
    expect(d).not.toBeNull()
    expect(d!.toISOString()).toBe('2026-09-22T17:00:00.000Z') // 2026-09-23 00:00 +07:00
  })

  it('rejects an invalid day/month value (e.g. 31/02) instead of silently rolling into the next month', () => {
    expect(parseImportDateCell('31/02/2026')).toBeNull()
  })

  it('rejects a malformed string', () => {
    expect(parseImportDateCell('2026-09-23')).toBeNull()
    expect(parseImportDateCell('not a date')).toBeNull()
  })

  it('treats "-"/blank as no date (null, not an error)', () => {
    expect(parseImportDateCell('-')).toBeNull()
    expect(parseImportDateCell('')).toBeNull()
    expect(parseImportDateCell('   ')).toBeNull()
  })

  it('accepts a native Date (Excel auto-converted the cell) by reformatting through the same parser', () => {
    const asDate = new Date('2026-09-23T10:00:00+07:00') // Excel might store any time-of-day for a "date" cell
    const d = parseImportDateCell(asDate)
    expect(d).not.toBeNull()
    expect(d!.toISOString()).toBe('2026-09-22T17:00:00.000Z')
  })
})

describe('parseImportTimeCell', () => {
  const dateKey = '2026-09-23'

  it('parses "HH:mm" combined with the row date into the correct Bangkok-time Date', () => {
    const d = parseImportTimeCell('08:05', dateKey)
    expect(d).not.toBeNull()
    expect(d!.toISOString()).toBe('2026-09-23T01:05:00.000Z') // 08:05 +07:00
  })

  it('rejects an out-of-range hour or minute', () => {
    expect(parseImportTimeCell('24:00', dateKey)).toBeNull()
    expect(parseImportTimeCell('12:60', dateKey)).toBeNull()
  })

  it('rejects a malformed string', () => {
    expect(parseImportTimeCell('8.05am', dateKey)).toBeNull()
  })

  it('treats "-"/blank as no time (null, not an error)', () => {
    expect(parseImportTimeCell('-', dateKey)).toBeNull()
    expect(parseImportTimeCell('', dateKey)).toBeNull()
  })

  it('accepts a native Date (Excel auto-converted the cell)', () => {
    const asDate = new Date('2026-01-01T08:05:00+07:00') // Excel time-only cells often carry an arbitrary date part
    const d = parseImportTimeCell(asDate, dateKey)
    expect(d).not.toBeNull()
    expect(d!.toISOString()).toBe('2026-09-23T01:05:00.000Z')
  })
})

// ── Full workbook round-trip (real exceljs read against a real in-memory .xlsx) ──

async function buildTestWorkbook(rows: string[][], headers = ['พนักงาน', 'วันที่', 'วัน', 'เช็คอิน', 'สถานที่เช็คอิน', 'เริ่มพัก', 'จบพัก', 'เช็คเอาท์', 'สถานที่เช็คเอาท์', 'มาสาย (นาที)', 'กลับก่อน (นาที)', 'ชั่วโมงทำงาน', 'สถานะ', 'ประเภทการลา', 'หมายเหตุ']): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  const sheet = wb.addWorksheet('Sheet1')
  sheet.addRow(headers)
  for (const row of rows) sheet.addRow(row)
  const buf = await wb.xlsx.writeBuffer()
  return buf as ArrayBuffer
}

// Column order matching the header list above: พนักงาน, วันที่, วัน, เช็คอิน, สถานที่เช็คอิน, เริ่มพัก, จบพัก, เช็คเอาท์, สถานที่เช็คเอาท์, ...
function row(employee: string, date: string, checkIn: string, lunchOut: string, lunchIn: string, checkOut: string): string[] {
  return [employee, date, '-', checkIn, '-', lunchOut, lunchIn, checkOut, '-', '-', '-', '-', '-', '-']
}

describe('parseAttendanceImportWorkbook', () => {
  it('parses a well-formed file into one AttendanceImportRawRow per data row, ignoring the non-raw columns entirely', async () => {
    const buf = await buildTestWorkbook([
      row('สมชาย ใจดี (E001)', '23/09/2026', '08:05', '12:00', '13:00', '17:30'),
      row('สมหญิง มีสุข (E002)', '24/09/2026', '09:00', '-', '-', '18:00'),
    ])
    const result = await parseAttendanceImportWorkbook(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].employeeName).toBe('สมชาย ใจดี')
    expect(result.rows[0].employeeCode).toBe('E001')
    expect(result.rows[0].date).not.toBeNull()
    expect(result.rows[0].checkIn).not.toBeNull()
    expect(result.rows[0].lunchOut).not.toBeNull()
    expect(result.rows[0].parseErrors).toEqual([])
    // row 2 has no lunch break — should parse fine with lunchOut/lunchIn null, no error
    expect(result.rows[1].lunchOut).toBeNull()
    expect(result.rows[1].lunchIn).toBeNull()
    expect(result.rows[1].parseErrors).toEqual([])
  })

  it('reports rowNumber matching the real Excel row (header=1, first data row=2)', async () => {
    const buf = await buildTestWorkbook([
      row('สมชาย ใจดี (E001)', '23/09/2026', '08:05', '12:00', '13:00', '17:30'),
    ])
    const result = await parseAttendanceImportWorkbook(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows[0].rowNumber).toBe(2)
  })

  it('collects a parseError (not a thrown exception) for a row with an unparseable date, and does not affect other rows', async () => {
    const buf = await buildTestWorkbook([
      row('สมชาย ใจดี (E001)', 'not-a-date', '08:05', '-', '-', '17:30'),
      row('สมหญิง มีสุข (E002)', '24/09/2026', '09:00', '-', '-', '18:00'),
    ])
    const result = await parseAttendanceImportWorkbook(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows[0].date).toBeNull()
    expect(result.rows[0].parseErrors.length).toBeGreaterThan(0)
    expect(result.rows[1].date).not.toBeNull()
    expect(result.rows[1].parseErrors).toEqual([])
  })

  it('collects a parseError for a missing employee code, without crashing the whole parse', async () => {
    const buf = await buildTestWorkbook([
      row('สมชาย ใจดี', '23/09/2026', '08:05', '-', '-', '17:30'), // no "(code)"
    ])
    const result = await parseAttendanceImportWorkbook(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows[0].employeeCode).toBeNull()
    expect(result.rows[0].parseErrors.some((e) => e.includes('รหัสพนักงาน'))).toBe(true)
  })

  it('skips a fully blank row silently (not counted as a data row at all)', async () => {
    const buf = await buildTestWorkbook([
      row('สมชาย ใจดี (E001)', '23/09/2026', '08:05', '-', '-', '17:30'),
      ['', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      row('สมหญิง มีสุข (E002)', '24/09/2026', '09:00', '-', '-', '18:00'),
    ])
    const result = await parseAttendanceImportWorkbook(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows).toHaveLength(2)
  })

  it('returns a headerError (not a throw, not a partial parse) when a required column is missing', async () => {
    const buf = await buildTestWorkbook(
      [['สมชาย ใจดี (E001)', '23/09/2026', '08:05', '17:30']],
      ['พนักงาน', 'วันที่', 'เช็คอิน', 'เช็คเอาท์'], // missing เริ่มพัก/จบพัก
    )
    const result = await parseAttendanceImportWorkbook(buf)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.headerError).toContain('เริ่มพัก')
    expect(result.headerError).toContain('จบพัก')
  })

  it('locates required columns by header text, tolerating a different column order', async () => {
    const wb = new ExcelJS.Workbook()
    const sheet = wb.addWorksheet('Sheet1')
    // Deliberately reordered vs. the real export
    sheet.addRow(['วันที่', 'เช็คเอาท์', 'พนักงาน', 'จบพัก', 'เช็คอิน', 'เริ่มพัก'])
    sheet.addRow(['23/09/2026', '17:30', 'สมชาย ใจดี (E001)', '13:00', '08:05', '12:00'])
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer

    const result = await parseAttendanceImportWorkbook(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows[0].employeeCode).toBe('E001')
    expect(result.rows[0].checkIn).not.toBeNull()
    expect(result.rows[0].checkOut).not.toBeNull()
  })
})

// ── Real round-trip against the ACTUAL export (lib/attendance-work-log-export.ts) ──
//
// Bug fixed 2026-09-23: the real export is NOT "header on row 1" — it has a
// title row, employee/department meta rows, a blank spacer, and a merged
// group-header row before the real column-header row (which lands on row 5
// or row 6 depending on whether a department line is present). A user
// re-uploading a file the system itself exported got "ไม่พบคอลัมน์ที่จำเป็น
// ในแถวหัวตาราง" every time. These tests call buildWorkLogXlsx() for real
// (not a hand-built fixture) and feed its actual output straight into
// parseAttendanceImportWorkbook(), for both real header-row positions.

function fixtureWorkLogRow(overrides: Partial<AttendanceWorkLogRow & { employeeName: string; employeeCode: string | null }> = {}) {
  return {
    id: 'att1',
    date: '2026-09-23',
    dateLabel: '23/09/2026',
    sessionIndex: 1,
    sessionLabel: 'รอบที่ 1',
    dayOfWeek: 3,
    dayLabel: 'พุธ',
    checkIn: '2026-09-23T01:05:00.000Z',
    checkInTime: '08:05',
    checkInPlace: 'สำนักงานใหญ่',
    checkInLat: null,
    checkInLng: null,
    lunchOut: null,
    lunchOutTime: '-',
    lunchIn: null,
    lunchInTime: '-',
    checkOut: '2026-09-23T10:30:00.000Z',
    checkOutTime: '17:30',
    checkOutPlace: 'สำนักงานใหญ่',
    checkOutLat: null,
    checkOutLng: null,
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
    lunchOverMinutes: 0,
    workMinutes: 480,
    workHoursLabel: '8 ชม.',
    status: 'NORMAL' as const,
    statusDisplay: 'ปกติ',
    leaveType: null,
    leaveTypeLabel: null,
    note: null,
    isOutside: false,
    employeeName: 'สมชาย ใจดี',
    employeeCode: 'E001',
    ...overrides,
  }
}

describe('parseAttendanceImportWorkbook — real round-trip against buildWorkLogXlsx()', () => {
  it('parses a real export with NO department line (title/employee/blank/group-header/real-header = rows 1-5, data from row 6... real header lands on row 5)', async () => {
    const meta: WorkLogExportMeta = {
      employeeName: 'ทุกคน (1 คน)',
      employeeId: null,
      department: null,
      month: 9,
      year: 2026,
      monthLabel: 'กันยายน',
      companyName: 'HRFlow Test Co.',
    }
    const buf = await buildWorkLogXlsx([fixtureWorkLogRow()], meta)
    const result = await parseAttendanceImportWorkbook(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows).toHaveLength(1)
    // groupRowNum=4, headerRowNum=5 (no department) — first data row is 6
    expect(result.rows[0].rowNumber).toBe(6)
    expect(result.rows[0].employeeName).toBe('สมชาย ใจดี')
    expect(result.rows[0].employeeCode).toBe('E001')
    expect(result.rows[0].date).not.toBeNull()
    expect(result.rows[0].checkIn).not.toBeNull()
    expect(result.rows[0].checkOut).not.toBeNull()
    expect(result.rows[0].parseErrors).toEqual([])
  })

  it('parses a real export WITH a department line (real header lands one row later, on row 6)', async () => {
    const meta: WorkLogExportMeta = {
      employeeName: 'สมชาย ใจดี',
      employeeId: 'E001',
      department: 'ฝ่ายบุคคล',
      month: 9,
      year: 2026,
      monthLabel: 'กันยายน',
      companyName: 'HRFlow Test Co.',
    }
    const buf = await buildWorkLogXlsx(
      [fixtureWorkLogRow({ employeeName: 'สมชาย ใจดี', employeeCode: 'E001' })],
      meta,
      { includeEmployeeColumn: true },
    )
    const result = await parseAttendanceImportWorkbook(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows).toHaveLength(1)
    // groupRowNum=5, headerRowNum=6 (department present) — first data row is 7
    expect(result.rows[0].rowNumber).toBe(7)
    expect(result.rows[0].employeeCode).toBe('E001')
    expect(result.rows[0].checkIn).not.toBeNull()
    expect(result.rows[0].checkOut).not.toBeNull()
    expect(result.rows[0].parseErrors).toEqual([])
  })

  it('parses multiple real employees from a real company-wide export (the actual "บันทึกรายเดือน" all-employees download HR would re-upload)', async () => {
    const meta: WorkLogExportMeta = {
      employeeName: 'ทุกคน (2 คน)',
      employeeId: null,
      department: null,
      month: 9,
      year: 2026,
      monthLabel: 'กันยายน',
      companyName: 'HRFlow Test Co.',
    }
    const rows = [
      fixtureWorkLogRow({ id: 'att1', employeeName: 'สมชาย ใจดี', employeeCode: 'E001' }),
      fixtureWorkLogRow({ id: 'att2', employeeName: 'สมหญิง มีสุข', employeeCode: 'E002', dateLabel: '24/09/2026' }),
    ]
    const buf = await buildWorkLogXlsx(rows, meta, { includeEmployeeColumn: true })
    const result = await parseAttendanceImportWorkbook(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows).toHaveLength(2)
    expect(result.rows.map((r) => r.employeeCode)).toEqual(['E001', 'E002'])
    expect(result.rows.every((r) => r.parseErrors.length === 0)).toBe(true)
  })
})
