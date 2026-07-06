import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { REQUEST_STATUS_LABEL as STATUS_LABEL } from '@/lib/status-labels'
import { OUTSIDE_WORK_PLAN_TITLE_DEFAULT } from '@/lib/company-defaults'

// Fallback text — matches what was previously hardcoded here before Settings made it editable
const COMPANY_NAME_FALLBACK = 'บริษัท เค เอ็ม เซอร์วิสพลัส จำกัด'

const DAY_TH   = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
const MONTH_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

function fmtRangeTH(from: string, to: string): string {
  const d1 = new Date(from + 'T00:00:00.000Z')
  const d2 = new Date(to   + 'T00:00:00.000Z')
  const sameMonth = d1.getUTCMonth() === d2.getUTCMonth() && d1.getUTCFullYear() === d2.getUTCFullYear()
  if (sameMonth) {
    return `${d1.getUTCDate()} - ${d2.getUTCDate()} ${MONTH_TH[d1.getUTCMonth()]} ${d1.getUTCFullYear() + 543}`
  }
  return `${d1.getUTCDate()} ${MONTH_TH[d1.getUTCMonth()]} - ${d2.getUTCDate()} ${MONTH_TH[d2.getUTCMonth()]} ${d2.getUTCFullYear() + 543}`
}

// weekStart is a local YYYY-MM-DD string; treat as UTC midnight for day arithmetic
function addDaysToYmd(ymd: string, n: number): string {
  const d = new Date(ymd + 'T00:00:00.000Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

type ExportRequest = {
  userId: string
  userName: string; userDept: string; userPosition: string
  date: string                    // ISO string from Prisma
  timeSlot?: string | null
  place: string; purpose: string
  clientCompanyName?: string | null
  caseNumber?: string | null; productWork?: string | null
  productCategory?: string | null; productType?: string | null; workBranch?: string | null
  caseCount?: number | null; adminChecked?: string | null; supervisedBy?: string | null
  status: string; approvalStatus?: string | null
  note?: string | null
  documentNumber?: string | null
}

// 16 data columns — no employee columns; employee name goes in row 11 header
const COLS = [
  { key: 'day',             label: 'วัน',                         sub: '',                                        width: 10 },
  { key: 'date',            label: 'ว/ด/ปี',                     sub: '',                                        width: 12 },
  { key: 'timeSlot',        label: 'ช่วงเวลา',                   sub: '(เช้า/บ่าย/เต็มวัน)',                     width: 13 },
  { key: 'place',           label: 'สถานที่ไปทำงาน',             sub: '',                                        width: 28 },
  { key: 'clientCompanyName', label: 'บริษัทลูกค้า',             sub: '',                                        width: 22 },
  { key: 'purpose',         label: 'สิ่งที่ไปดำเนินการ',         sub: '',                                        width: 30 },
  { key: 'caseNumber',      label: 'หมายเลขคดีดำ',              sub: '',                                        width: 14 },
  { key: 'productCategory', label: 'หมวดหมู่งานโปรดักส์',        sub: '',                                        width: 18 },
  { key: 'productType',     label: 'ประเภทย่อย',                 sub: '',                                        width: 16 },
  { key: 'productWork',     label: 'งานโปรดักส์ (เดิม)',          sub: '',                                        width: 16 },
  { key: 'workBranch',      label: 'งานของสาขาไหน',             sub: '',                                        width: 14 },
  { key: 'caseCount',       label: 'จำนวนคดีที่ไปดำเนินการ',    sub: '',                                        width: 14 },
  { key: 'adminChecked',    label: 'แอดมินโปรดักส์ตรวจสอบ',     sub: '(มี/ไม่มี)',                              width: 14 },
  { key: 'supervisedBy',    label: 'ผู้สั่งงาน',                 sub: '(แอดมิน/หัวหน้า/ทนายวางแผนตามเอง)',     width: 22 },
  { key: 'status',          label: 'อนุมัติ/ไม่อนุมัติ',        sub: '',                                        width: 13 },
  { key: 'note',            label: 'หมายเหตุ',                   sub: '',                                        width: 20 },
]
const NC = COLS.length // 16

function thinBorder(argb = 'FFB0C4DE') {
  return {
    top:    { style: 'thin' as const, color: { argb } },
    bottom: { style: 'thin' as const, color: { argb } },
    left:   { style: 'thin' as const, color: { argb } },
    right:  { style: 'thin' as const, color: { argb } },
  }
}

// Columns whose data cells are centre-aligned (indices match COLS order above)
const CENTRE_COLS = new Set([1, 2, 3, 7, 8, 9, 11, 12, 13, 14, 15])

function applyStatusColour(cell: ExcelJS.Cell, label: string) {
  if (!label) return
  if (label === STATUS_LABEL['approved_by_ceo'] || label === STATUS_LABEL['APPROVED']) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }
    cell.font = { color: { argb: 'FF065F46' }, bold: true, size: 10, name: 'TH SarabunPSK' }
  } else if (label === STATUS_LABEL['rejected_by_ceo'] || label === STATUS_LABEL['REJECTED']) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }
    cell.font = { color: { argb: 'FF991B1B' }, bold: true, size: 10, name: 'TH SarabunPSK' }
  } else {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } }
    cell.font = { color: { argb: 'FF78350F' }, bold: true, size: 10, name: 'TH SarabunPSK' }
  }
}

function buildEmployeeSheet(
  ws: ExcelJS.Worksheet,
  employeeName: string,
  weekStart: string,   // YYYY-MM-DD (local Bangkok date)
  weekEnd:   string,
  requests:  ExportRequest[],
  companyName: string,
  planTitle: string,
) {
  ws.columns = COLS.map(c => ({ key: c.key, width: c.width }))

  // ── Rows 1–4: blank area (logo / letterhead space) ──────────────────────
  for (let i = 0; i < 4; i++) {
    const r = ws.addRow([])
    r.height = i === 0 ? 40 : 16
  }

  // ── Row 5: Company name ──────────────────────────────────────────────────
  const r5 = ws.addRow([companyName])
  ws.mergeCells(5, 1, 5, NC)
  r5.height = 28
  r5.getCell(1).font      = { bold: true, size: 14, name: 'TH SarabunPSK' }
  r5.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }

  // ── Row 6: Address ───────────────────────────────────────────────────────
  const r6 = ws.addRow(['เลขที่ 99/1 หมู่ที่ 1 ถนนพหลโยธิน ตำบลคลองหนึ่ง อำเภอคลองหลวง จังหวัดปทุมธานี 12120'])
  ws.mergeCells(6, 1, 6, NC)
  r6.height = 20
  r6.getCell(1).font      = { size: 11, name: 'TH SarabunPSK' }
  r6.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }

  // ── Row 7: Phone / Email ─────────────────────────────────────────────────
  const r7 = ws.addRow(['โทรศัพท์: 02-XXX-XXXX  |  Email: info@kmserviceplus.com'])
  ws.mergeCells(7, 1, 7, NC)
  r7.height = 20
  r7.getCell(1).font      = { size: 11, name: 'TH SarabunPSK' }
  r7.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }

  // ── Row 8: blank ─────────────────────────────────────────────────────────
  ws.addRow([]).height = 10

  // ── Row 9: Form title ────────────────────────────────────────────────────
  const r9 = ws.addRow([planTitle])
  ws.mergeCells(9, 1, 9, NC)
  r9.height = 26
  r9.getCell(1).font      = { bold: true, size: 13, name: 'TH SarabunPSK' }
  r9.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }

  // ── Row 10: Date range ───────────────────────────────────────────────────
  const r10 = ws.addRow([`แผนงานช่วงวันที่  ${fmtRangeTH(weekStart, weekEnd)}`])
  ws.mergeCells(10, 1, 10, NC)
  r10.height = 22
  r10.getCell(1).font      = { size: 12, name: 'TH SarabunPSK' }
  r10.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }

  // ── Row 11: Employee name ────────────────────────────────────────────────
  const r11 = ws.addRow([`บังคับคดีผู้จัดทำแผน  ${employeeName}`])
  ws.mergeCells(11, 1, 11, NC)
  r11.height = 22
  r11.getCell(1).font      = { size: 12, name: 'TH SarabunPSK' }
  r11.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', indent: 2 }

  // ── Rows 12–13: blank ────────────────────────────────────────────────────
  ws.addRow([]).height = 8
  ws.addRow([]).height = 8

  // ── Rows 14–15: Table header (2 rows with sub-labels) ───────────────────
  const HDR_BG   = 'FF1A3A5C'
  const HDR_FONT = { bold: true, size: 10, color: { argb: 'FFFFFFFF' }, name: 'TH SarabunPSK' }
  const HDR_ALN  = { horizontal: 'center' as const, vertical: 'middle' as const, wrapText: true }

  const r14 = ws.addRow(COLS.map(c => c.label))
  r14.height = 30
  r14.eachCell(cell => {
    cell.font      = HDR_FONT
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: HDR_BG } }
    cell.alignment = HDR_ALN
    cell.border    = thinBorder('FF4A7AB5')
  })

  const r15 = ws.addRow(COLS.map(c => c.sub))
  r15.height = 20
  r15.eachCell(cell => {
    cell.font      = { ...HDR_FONT, bold: false, size: 9 }
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: HDR_BG } }
    cell.alignment = HDR_ALN
    cell.border    = thinBorder('FF4A7AB5')
  })

  // Columns without sub-label: merge rows 14–15 vertically
  COLS.forEach((col, i) => {
    if (!col.sub) ws.mergeCells(14, i + 1, 15, i + 1)
  })

  // ── Data: 7 days × 2 rows (เช้า / บ่าย) ─────────────────────────────────
  const byDate: Record<string, ExportRequest[]> = {}
  requests.forEach(r => {
    const ymd = r.date.slice(0, 10)
    if (!byDate[ymd]) byDate[ymd] = []
    byDate[ymd].push(r)
  })

  const STRIPE_A = 'FFF5F8FF'
  const STRIPE_B = 'FFFAFCFF'

  let nextRow = 16

  for (let i = 0; i < 7; i++) {
    const ymd       = addDaysToYmd(weekStart, i)
    const d         = new Date(ymd + 'T00:00:00.000Z')
    const dayName   = DAY_TH[d.getUTCDay()]
    const dateTH    = `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear() + 543}`
    const bg        = i % 2 === 0 ? STRIPE_A : STRIPE_B
    const dayReqs   = byDate[ymd] ?? []

    // Slot: เช้า row → timeSlot is เช้า / เต็มวัน / null / empty
    const morningReq   = dayReqs.find(r =>
      !r.timeSlot || r.timeSlot === 'เช้า' || r.timeSlot === 'เต็มวัน'
    ) ?? null
    // Slot: บ่าย row
    const afternoonReq = dayReqs.find(r => r.timeSlot === 'บ่าย') ?? null

    function slotValues(req: ExportRequest | null, slotLabel: string): (string | number)[] {
      const statusLabel = req
        ? (STATUS_LABEL[req.approvalStatus ?? req.status] ?? (req.approvalStatus ?? req.status))
        : ''
      return [
        dayName,
        dateTH,
        req?.timeSlot ?? slotLabel,
        req?.place       ?? '',
        req?.clientCompanyName ?? '',
        req?.purpose     ?? '',
        req?.caseNumber  ?? '',
        req?.productCategory ?? '',
        req?.productType     ?? '',
        req?.productWork ?? '',
        req?.workBranch  ?? '',
        req?.caseCount != null ? req.caseCount : '',
        req?.adminChecked ?? '',
        req?.supervisedBy ?? '',
        statusLabel,
        req?.note ?? '',
      ]
    }

    const rMorn = ws.addRow(slotValues(morningReq,   'เช้า'))
    const rAftn = ws.addRow(slotValues(afternoonReq, 'บ่าย'))
    rMorn.height = 20
    rAftn.height = 20

    ;[rMorn, rAftn].forEach(row => {
      row.eachCell((cell, col) => {
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
        cell.border    = thinBorder()
        cell.font      = { size: 10, name: 'TH SarabunPSK' }
        cell.alignment = {
          vertical:   'middle',
          horizontal: CENTRE_COLS.has(col) ? 'center' : 'left',
          wrapText:   col >= 4,
        }
      })
      // Status column (15) colour
      const statusCell  = row.getCell(15)
      applyStatusColour(statusCell, statusCell.value as string)
    })

    // Merge วัน (col 1) and ว/ด/ปี (col 2) across the 2 slot rows
    const r1 = nextRow
    const r2 = nextRow + 1
    ws.mergeCells(r1, 1, r2, 1)
    ws.mergeCells(r1, 2, r2, 2)
    rMorn.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
    rMorn.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' }

    nextRow += 2
  }

  // ── Footer note ──────────────────────────────────────────────────────────
  ws.addRow([]).height = 12

  const rNote = ws.addRow(['หมายเหตุ: '])
  ws.mergeCells(rNote.number, 1, rNote.number, NC)
  rNote.height = 20
  rNote.getCell(1).font      = { size: 10, name: 'TH SarabunPSK' }
  rNote.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }

  // ── Signature rows ───────────────────────────────────────────────────────
  ws.addRow([]).height = 20

  const rSig1 = ws.addRow([])
  rSig1.getCell(3).value  = 'ลงชื่อ ___________________________'
  rSig1.getCell(10).value = 'ลงชื่อ ___________________________'
  ws.mergeCells(rSig1.number, 3, rSig1.number, 8)
  ws.mergeCells(rSig1.number, 10, rSig1.number, NC)
  rSig1.height = 24
  ;[3, 10].forEach(col => {
    rSig1.getCell(col).alignment = { horizontal: 'center', vertical: 'middle' }
    rSig1.getCell(col).font = { size: 11, name: 'TH SarabunPSK' }
  })

  const rSig2 = ws.addRow([])
  rSig2.getCell(3).value  = '(ผู้จัดทำแผน)'
  rSig2.getCell(10).value = '(ผู้อนุมัติ / CEO)'
  ws.mergeCells(rSig2.number, 3, rSig2.number, 8)
  ws.mergeCells(rSig2.number, 10, rSig2.number, NC)
  rSig2.height = 20
  ;[3, 10].forEach(col => {
    rSig2.getCell(col).alignment = { horizontal: 'center', vertical: 'middle' }
    rSig2.getCell(col).font = { size: 10, name: 'TH SarabunPSK' }
  })

  // Freeze top 15 rows (header + company info)
  ws.views = [{ state: 'frozen', ySplit: 15, xSplit: 0 }]
}

// ── POST /api/outside-work/export ────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    weekStart    = '',
    weekEnd      = '',
    canViewAll   = false,
    requests     = [],
    filterUserId = null,
  } = body as {
    weekStart:    string
    weekEnd:      string
    canViewAll:   boolean
    requests:     ExportRequest[]
    filterUserId: string | null
  }

  // Derive weekEnd from weekStart if not provided
  const resolvedWeekEnd = weekEnd || (weekStart ? addDaysToYmd(weekStart, 6) : '')

  const companySettings = await prisma.companySettings.findUnique({
    where: { id: 'singleton' },
    select: { companyName: true, outsideWorkPlanTitle: true },
  }).catch(() => null)
  const companyName = companySettings?.companyName || COMPANY_NAME_FALLBACK
  const planTitle    = companySettings?.outsideWorkPlanTitle || OUTSIDE_WORK_PLAN_TITLE_DEFAULT

  const wb = new ExcelJS.Workbook()
  wb.creator  = 'HRflow'
  wb.created  = new Date()

  if (canViewAll && !filterUserId) {
    // Multiple employees → one sheet per employee
    const byEmp = new Map<string, { name: string; reqs: ExportRequest[] }>()
    requests.forEach(r => {
      if (!byEmp.has(r.userId)) byEmp.set(r.userId, { name: r.userName, reqs: [] })
      byEmp.get(r.userId)!.reqs.push(r)
    })

    if (byEmp.size === 0) {
      buildEmployeeSheet(wb.addWorksheet('ไม่มีข้อมูล'), '', weekStart, resolvedWeekEnd, [], companyName, planTitle)
    } else {
      byEmp.forEach(({ name, reqs }) => {
        const sheetName = name.replace(/[\\/*?[\]:]/g, '').slice(0, 31) || 'พนักงาน'
        buildEmployeeSheet(wb.addWorksheet(sheetName), name, weekStart, resolvedWeekEnd, reqs, companyName, planTitle)
      })
    }
  } else {
    // Single employee view
    const filteredReqs = filterUserId ? requests.filter(r => r.userId === filterUserId) : requests
    const empName      = filteredReqs[0]?.userName ?? session.user.name ?? ''
    buildEmployeeSheet(wb.addWorksheet('แผนงานออกนอกพื้นที่'), empName, weekStart, resolvedWeekEnd, filteredReqs, companyName, planTitle)
  }

  const buffer  = await wb.xlsx.writeBuffer()
  const dateTag = weekStart ? weekStart.slice(0, 7) : new Date().toISOString().slice(0, 7)
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="outside-work-${dateTag}.xlsx"`,
    },
  })
}
