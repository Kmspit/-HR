import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

const DAY_TH   = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
const MONTH_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const STATUS_LABEL: Record<string, string> = {
  PENDING: 'รออนุมัติ', pending_ceo: 'รออนุมัติ',
  APPROVED: 'อนุมัติ', approved_by_ceo: 'อนุมัติ',
  REJECTED: 'ไม่อนุมัติ', rejected_by_ceo: 'ไม่อนุมัติ',
}

function fmtDateShort(iso: string): string {
  const d = new Date(iso)
  return `${d.getUTCDate()} ${MONTH_TH[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`
}

// POST /api/outside-work/export
// Body: { weekLabel: string, canViewAll: boolean, requests: Request[] }
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { weekLabel = '', canViewAll = false, requests = [] } = body as {
    weekLabel: string
    canViewAll: boolean
    requests: Array<{
      userName: string; userDept: string; userPosition: string
      date: string; place: string; purpose: string
      ownerName?: string | null; workType?: string | null
      startTime: string; endTime: string
      distance?: number | null; routeType?: string | null
      status: string; approvalStatus?: string | null
    }>
  }

  const wb = new ExcelJS.Workbook()
  wb.creator = 'HRflow'
  const ws = wb.addWorksheet('Outside Work')

  const hasEmployee = !!canViewAll
  const cols = [
    ...(hasEmployee ? [
      { header: 'ชื่อพนักงาน', key: 'name',     width: 22 },
      { header: 'สาขา/แผนก',   key: 'dept',     width: 18 },
      { header: 'ตำแหน่ง',     key: 'position', width: 18 },
    ] : []),
    { header: 'วัน',           key: 'day',      width: 12 },
    { header: 'วันที่',         key: 'date',     width: 14 },
    { header: 'สถานที่',        key: 'place',    width: 28 },
    { header: 'วัตถุประสงค์',   key: 'purpose',  width: 30 },
    { header: 'เจ้าของกิจการ',  key: 'owner',    width: 20 },
    { header: 'ประเภทงาน',      key: 'workType', width: 16 },
    { header: 'เวลาออก',        key: 'start',    width: 10 },
    { header: 'เวลากลับ',       key: 'end',      width: 10 },
    { header: 'ระยะทาง (กม.)',   key: 'dist',    width: 13 },
    { header: 'เส้นทาง',        key: 'route',    width: 14 },
    { header: 'สถานะ',          key: 'status',   width: 14 },
  ]
  ws.columns = cols

  // Header row style
  const headerRow = ws.getRow(1)
  headerRow.font = { bold: true, size: 11 }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
  headerRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }
  headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  headerRow.height = 30

  // Title row above headers
  ws.spliceRows(1, 0, [`รายงานออกนอกสถานที่ — ${weekLabel}`])
  const titleRow = ws.getRow(1)
  titleRow.font = { bold: true, size: 13 }
  ws.mergeCells(1, 1, 1, cols.length)
  titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  titleRow.height = 28

  requests.forEach(r => {
    const d = new Date(r.date)
    const status = STATUS_LABEL[r.approvalStatus ?? r.status] ?? (r.approvalStatus ?? r.status)
    const row: Record<string, string | number> = {
      day:      DAY_TH[d.getUTCDay()],
      date:     fmtDateShort(r.date),
      place:    r.place,
      purpose:  r.purpose,
      owner:    r.ownerName ?? '',
      workType: r.workType ?? '',
      start:    r.startTime,
      end:      r.endTime,
      dist:     r.distance ?? '',
      route:    r.routeType ?? '',
      status,
    }
    if (hasEmployee) {
      row.name     = r.userName
      row.dept     = r.userDept
      row.position = r.userPosition
    }
    const dataRow = ws.addRow(row)
    dataRow.alignment = { vertical: 'middle', wrapText: true }
    dataRow.height = 22

    // Color status cell
    const statusCell = dataRow.getCell('status')
    if (status === 'อนุมัติ') {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }
      statusCell.font = { color: { argb: 'FF065F46' } }
    } else if (status === 'ไม่อนุมัติ') {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }
      statusCell.font = { color: { argb: 'FF991B1B' } }
    } else {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } }
      statusCell.font = { color: { argb: 'FF78350F' } }
    }
  })

  // Freeze header rows and auto-filter
  ws.views = [{ state: 'frozen', ySplit: 2 }]
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: cols.length } }

  const buffer = await wb.xlsx.writeBuffer()
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="outside-work.xlsx"`,
    },
  })
}
