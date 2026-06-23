import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

const DAY_TH   = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
const MONTH_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'รออนุมัติ', pending_ceo: 'รออนุมัติ',
  APPROVED: 'อนุมัติ',  approved_by_ceo: 'อนุมัติ',
  REJECTED: 'ไม่อนุมัติ', rejected_by_ceo: 'ไม่อนุมัติ',
}

function fmtDateTH(iso: string): string {
  const d = new Date(iso)
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear() + 543}`
}

function fmtRangeTH(from: string, to: string): string {
  const d1 = new Date(from)
  const d2 = new Date(to)
  const sameMonth = d1.getUTCMonth() === d2.getUTCMonth() && d1.getUTCFullYear() === d2.getUTCFullYear()
  if (sameMonth) {
    return `${d1.getUTCDate()} - ${d2.getUTCDate()} ${MONTH_TH[d1.getUTCMonth()]} ${d1.getUTCFullYear() + 543}`
  }
  return `${d1.getUTCDate()} ${MONTH_TH[d1.getUTCMonth()]} - ${d2.getUTCDate()} ${MONTH_TH[d2.getUTCMonth()]} ${d2.getUTCFullYear() + 543}`
}

type ExportRequest = {
  userName: string; userDept: string; userPosition: string
  date: string
  timeSlot?: string | null
  place: string; purpose: string
  caseNumber?: string | null; productWork?: string | null; workBranch?: string | null
  caseCount?: number | null; adminChecked?: string | null; supervisedBy?: string | null
  status: string; approvalStatus?: string | null
  note?: string | null
}

// POST /api/outside-work/export
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { weekStart = '', weekEnd = '', canViewAll = false, requests = [] } = body as {
    weekStart: string
    weekEnd: string
    canViewAll: boolean
    requests: ExportRequest[]
  }

  const wb = new ExcelJS.Workbook()
  wb.creator = 'HRflow'
  wb.created = new Date()
  const ws = wb.addWorksheet('แผนงานออกนอกพื้นที่')

  // ── Column definitions (13 Excel columns) ────────────────────────────────────
  const dataCols = [
    { header: 'วัน',                             key: 'day',          width: 10 },
    { header: 'ว/ด/ปี',                          key: 'date',         width: 12 },
    { header: 'ช่วงเวลา\n(เช้า/บ่าย)',           key: 'timeSlot',     width: 12 },
    { header: 'สถานที่\nไปทำงาน',                key: 'place',        width: 28 },
    { header: 'สิ่งที่ไป\nดำเนินการ',            key: 'purpose',      width: 30 },
    { header: 'หมายเลขคดีดำ',                    key: 'caseNumber',   width: 14 },
    { header: 'งานโปรดักส์',                     key: 'productWork',  width: 16 },
    { header: 'งานของ\nสาขาไหน',                key: 'workBranch',   width: 14 },
    { header: 'จำนวนคดี\nที่ไปดำเนินการ',        key: 'caseCount',    width: 13 },
    { header: 'แอดมินโปรดักส์\nตรวจสอบ',        key: 'adminChecked', width: 14 },
    { header: 'ผู้สั่งงาน',                       key: 'supervisedBy', width: 20 },
    { header: 'อนุมัติ/\nไม่อนุมัติ',            key: 'status',       width: 13 },
    { header: 'หมายเหตุ',                         key: 'note',         width: 20 },
  ]
  const employeeCols = canViewAll ? [
    { header: 'ชื่อ-สกุล',  key: 'name',     width: 20 },
    { header: 'สาขา/แผนก', key: 'dept',     width: 16 },
    { header: 'ตำแหน่ง',   key: 'position', width: 16 },
  ] : []
  ws.columns = [...employeeCols, ...dataCols]
  const totalCols = ws.columns.length

  // ── Row 1: Company name ───────────────────────────────────────────────────────
  ws.addRow(['บริษัท เค เอ็ม เซอร์วิสพลัส จำกัด'])
  ws.mergeCells(1, 1, 1, totalCols)
  const r1 = ws.getRow(1)
  r1.getCell(1).font      = { bold: true, size: 14 }
  r1.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  r1.height = 30

  // ── Row 2: Title + date range ─────────────────────────────────────────────────
  const rangeStr = weekStart && weekEnd ? fmtRangeTH(weekStart, weekEnd) : ''
  ws.addRow([`แผนการดำเนินการออกนอกพื้นที่  ช่วงวันที่ ${rangeStr}`])
  ws.mergeCells(2, 1, 2, totalCols)
  const r2 = ws.getRow(2)
  r2.getCell(1).font      = { bold: true, size: 12 }
  r2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  r2.height = 26

  // ── Row 3: Prepared by ───────────────────────────────────────────────────────
  const names = canViewAll
    ? [...new Set(requests.map(r => r.userName))].join(', ')
    : requests[0]?.userName ?? session.user.name ?? ''
  ws.addRow([`ผู้จัดทำแผน : ${names}`])
  ws.mergeCells(3, 1, 3, totalCols)
  const r3 = ws.getRow(3)
  r3.getCell(1).font      = { size: 11 }
  r3.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  r3.height = 22

  // ── Row 4: Column headers ─────────────────────────────────────────────────────
  const headerRow = ws.addRow([...employeeCols, ...dataCols].map(c => c.header))
  headerRow.height = 36
  headerRow.eachCell(cell => {
    cell.font      = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3A5C' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border    = {
      top:    { style: 'thin', color: { argb: 'FF4A7AB5' } },
      bottom: { style: 'thin', color: { argb: 'FF4A7AB5' } },
      left:   { style: 'thin', color: { argb: 'FF4A7AB5' } },
      right:  { style: 'thin', color: { argb: 'FF4A7AB5' } },
    }
  })

  // ── Data rows ─────────────────────────────────────────────────────────────────
  requests.forEach((r, idx) => {
    const d      = new Date(r.date)
    const status = STATUS_LABEL[r.approvalStatus ?? r.status] ?? (r.approvalStatus ?? r.status)
    const rowBg  = idx % 2 === 0 ? 'FFFAFCFF' : 'FFF0F5FA'

    const rowData: (string | number)[] = [
      ...(canViewAll ? [r.userName, r.userDept, r.userPosition] : []),
      DAY_TH[d.getUTCDay()],
      fmtDateTH(r.date),
      r.timeSlot     ?? '',
      r.place,
      r.purpose,
      r.caseNumber   ?? '',
      r.productWork  ?? '',
      r.workBranch   ?? '',
      r.caseCount    ?? '',
      r.adminChecked ?? '',
      r.supervisedBy ?? '',
      status,
      r.note         ?? '',
    ]

    const dataRow = ws.addRow(rowData)
    dataRow.height = 20
    dataRow.eachCell((cell, colNum) => {
      cell.alignment = { vertical: 'middle', wrapText: colNum >= (canViewAll ? 5 : 2) }
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } }
      cell.border    = {
        bottom: { style: 'thin', color: { argb: 'FFD0DCE8' } },
        left:   { style: 'thin', color: { argb: 'FFD0DCE8' } },
        right:  { style: 'thin', color: { argb: 'FFD0DCE8' } },
      }
    })

    // centre certain columns
    const centreKeys = ['day', 'date', 'timeSlot', 'caseNumber', 'workBranch', 'caseCount', 'adminChecked', 'status']
    centreKeys.forEach(key => {
      const col = ws.columns.find(c => (c as { key?: string }).key === key)
      if (col && col.number) dataRow.getCell(col.number).alignment = { horizontal: 'center', vertical: 'middle' }
    })

    // status colour
    const statusColIdx = ws.columns.findIndex(c => (c as { key?: string }).key === 'status') + 1
    if (statusColIdx > 0) {
      const statusCell = dataRow.getCell(statusColIdx)
      if (status === 'อนุมัติ') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }
        statusCell.font = { color: { argb: 'FF065F46' }, bold: true }
      } else if (status === 'ไม่อนุมัติ') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }
        statusCell.font = { color: { argb: 'FF991B1B' }, bold: true }
      } else {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } }
        statusCell.font = { color: { argb: 'FF78350F' }, bold: true }
      }
    }
  })

  // ── Signature footer ──────────────────────────────────────────────────────────
  ws.addRow([])
  const sigRow = ws.addRow([
    '', '', '',
    'ลงชื่อ ___________________',
    '', '', '', '', '', '', '',
    'ลงชื่อ ___________________',
    '',
  ])
  ws.mergeCells(sigRow.number, 4, sigRow.number, 7)
  ws.mergeCells(sigRow.number, 8, sigRow.number, 11)
  ws.mergeCells(sigRow.number, 12, sigRow.number, totalCols)
  sigRow.height = 24

  const sig2Row = ws.addRow([
    '', '', '',
    '(ผู้จัดทำแผน)',
    '', '', '', '', '', '', '',
    '(ผู้อนุมัติ)',
    '',
  ])
  sig2Row.eachCell((cell, col) => {
    if (col === 4 || col === 12) cell.alignment = { horizontal: 'center' }
  })

  // ── Freeze + filter ───────────────────────────────────────────────────────────
  ws.views = [{ state: 'frozen', ySplit: 4, xSplit: canViewAll ? 2 : 0 }]
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: totalCols } }

  const buffer = await wb.xlsx.writeBuffer()
  const dateTag = weekStart ? weekStart.slice(0, 7) : new Date().toISOString().slice(0, 7)
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="outside-work-${dateTag}.xlsx"`,
    },
  })
}
