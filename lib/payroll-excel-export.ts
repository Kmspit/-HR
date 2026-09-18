import ExcelJS from 'exceljs'
import { parseTaxDetail } from '@/lib/payroll-tax'
import { payrollPeriodRange } from '@/lib/payroll-period'

export type PayrollExportRow = {
  employeeId: string | null
  name: string
  position: string | null
  branchName: string
  divisionName: string | null
  divisionSortOrder: number
  departmentName: string | null
  departmentSortOrder: number
  baseSalary: number
  positionAllowance: number
  diligenceAllowance: number
  backPay: number
  otherAddition: number
  professionalFee: number
  commission: number
  socialSecurity: number
  professionalFeeTax: number
  taxDetail: string | null
  lateDeduction: number
  absentDeduction: number
  unpaidLeave: number
  earlyLeaveDeduction: number
  otherDeduction: number
  securityDepositDeduction: number
  securityDepositInstallmentNo: number | null
  securityDepositTotalInstallments: number | null
  studentLoanDeduction: number
  netSalary: number
  note: string | null
}

export type PayrollExportMeta = {
  month: number
  year: number
  monthLabel: string
  /** ชื่อ/บทบาทผู้ลงนาม 3 ช่อง (ฝ่ายบุคคล / ผจก.บัญชี / กรรมการผู้จัดการ) —
   * ไม่มีในฐานข้อมูล (ไม่มี model เก็บผู้มีอำนาจลงนามในระบบตอนนี้) รับเป็น
   * ค่าว่างไว้ให้กรอกมือหลัง export ถ้าไม่ระบุมา */
  signers?: { role: string; name?: string }[]
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

type ColDef = { key: string; header: string; group: string; width: number; align: 'left' | 'center' | 'right' }

/** เผื่อความกว้างพอสำหรับตัวเลข 8 หลักขึ้นไปพร้อมทศนิยม+comma แยกหลักพัน
 *  เช่น "99,999,999.99" (13 ตัวอักษร) — ใช้กับทุกคอลัมน์ตัวเลขเงิน เพื่อไม่ให้
 *  ขึ้น "#####" เมื่อยอดรวมสาขา/แผนกใหญ่เกินเงินเดือนคนเดียว */
const MONEY_COL_WIDTH = 15

const COLUMNS: ColDef[] = [
  { key: 'no', header: 'ที่', group: 'ที่', width: 5, align: 'center' },
  { key: 'name', header: 'ชื่อ - สกุลพนักงาน', group: 'ชื่อ - สกุลพนักงาน', width: 26, align: 'left' },
  { key: 'position', header: 'ตำแหน่ง', group: 'รายได้', width: 18, align: 'left' },
  { key: 'baseSalary', header: 'เงินเดือน', group: 'รายได้', width: MONEY_COL_WIDTH, align: 'right' },
  { key: 'positionAllowance', header: 'ค่าตำแหน่ง', group: 'รายได้', width: MONEY_COL_WIDTH, align: 'right' },
  { key: 'diligenceAllowance', header: 'เบี้ยขยัน', group: 'รายได้', width: MONEY_COL_WIDTH, align: 'right' },
  { key: 'backPay', header: 'ตกเบิกเงินเดือน', group: 'รายได้', width: MONEY_COL_WIDTH, align: 'right' },
  { key: 'otherAddition', header: 'เงินได้อื่นๆ', group: 'รายได้', width: MONEY_COL_WIDTH, align: 'right' },
  { key: 'professionalFee', header: 'ค่าวิชาชีพ', group: 'รายได้', width: MONEY_COL_WIDTH, align: 'right' },
  { key: 'commission', header: 'คอมมิชชั่น', group: 'รายได้', width: MONEY_COL_WIDTH, align: 'right' },
  { key: 'totalIncome', header: 'ยอดรวมรายได้', group: 'รายได้', width: MONEY_COL_WIDTH, align: 'right' },
  { key: 'ss', header: 'สปส.', group: 'รายการหัก', width: MONEY_COL_WIDTH, align: 'right' },
  { key: 'tax40_1', header: 'ภงด.1 40(1)', group: 'รายการหัก', width: MONEY_COL_WIDTH, align: 'right' },
  { key: 'tax40_2', header: 'ภงด.1 40(2)', group: 'รายการหัก', width: MONEY_COL_WIDTH, align: 'right' },
  { key: 'tax40_6', header: 'ภงด.3 40(6)', group: 'รายการหัก', width: MONEY_COL_WIDTH, align: 'right' },
  { key: 'attendanceDeduction', header: 'ขาด/ลา/มาสาย', group: 'รายการหัก', width: MONEY_COL_WIDTH, align: 'right' },
  { key: 'otherDeduction', header: 'อื่นๆ', group: 'รายการหัก', width: MONEY_COL_WIDTH, align: 'right' },
  { key: 'totalDeduction', header: 'รวมหัก', group: 'รายการหัก', width: MONEY_COL_WIDTH, align: 'right' },
  { key: 'monthlyNet', header: 'รวมเดือน', group: 'รวมเดือน', width: MONEY_COL_WIDTH, align: 'right' },
  { key: 'securityDeposit', header: 'ประกันงาน', group: 'ประกันงาน', width: MONEY_COL_WIDTH, align: 'right' },
  { key: 'studentLoan', header: 'กยศ', group: 'กยศ', width: MONEY_COL_WIDTH, align: 'right' },
  { key: 'netSalary', header: 'จ่ายสุทธิ', group: 'จ่ายสุทธิ', width: MONEY_COL_WIDTH, align: 'right' },
  { key: 'note', header: 'หมายเหตุ', group: 'หมายเหตุ', width: 18, align: 'left' },
]

function n(v: number): number {
  return Math.round(v * 100) / 100
}

const MONTH_TH_SHORT = [
  '',
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]

/** "ประจำเดือน [ชื่อเดือน] [ปี]" ยังหมายถึงเดือนปิดยอด/จ่ายเงินเหมือนเดิม —
 *  แค่บอกช่วงวันที่นับมาสาย/ขาด/ลาจริง (21 ของเดือนก่อน - 20 ของเดือนนี้)
 *  กันสับสน — ใช้ปี ค.ศ. ตรงๆ ไม่ใส่ +543 ให้สอดคล้องกับ meta.year ข้างบน
 *  ที่ไฟล์นี้แสดงเป็น ค.ศ. อยู่แล้ว (ไม่เหมือนสลิป/PayrollClient ที่ใช้ พ.ศ.) */
function formatPayrollPeriodCaption(month: number, year: number): string {
  const { start, end } = payrollPeriodRange(month, year)
  const startLabel = `${start.getDate()} ${MONTH_TH_SHORT[start.getMonth() + 1]}`
  const endLabel = `${end.getDate()} ${MONTH_TH_SHORT[end.getMonth() + 1]} ${end.getFullYear()}`
  return `(นับเวลาทำงาน ${startLabel} - ${endLabel})`
}

function excelAlign(a: ColDef['align']): Partial<ExcelJS.Alignment> {
  return { vertical: 'middle', horizontal: a, wrapText: a === 'left' }
}

function moneyCell(cell: ExcelJS.Cell, value: number, opts: { negative?: boolean; header?: boolean; bold?: boolean; zebra?: boolean }) {
  cell.value = value === 0 ? (opts.header ? value : '') : n(opts.negative ? -Math.abs(value) : value)
  cell.numFmt = '#,##0.00;[Red]-#,##0.00'
  cell.font = { size: 10, bold: !!opts.bold, color: { argb: 'FF0F172A' } }
  cell.border = EXCEL_BORDER_THIN
  cell.alignment = excelAlign('right')
  if (opts.zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
}

function textCell(cell: ExcelJS.Cell, value: string, col: ColDef, opts: { bold?: boolean; zebra?: boolean } = {}) {
  cell.value = value
  cell.font = { size: 10, bold: !!opts.bold, color: { argb: 'FF0F172A' } }
  cell.border = EXCEL_BORDER_THIN
  cell.alignment = excelAlign(col.align)
  if (opts.zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
}

/** งวดเงินประกัน แสดงเป็น "(เงินประกัน 3/6)" ต่อท้ายหมายเหตุเดิม ถ้ามี */
function buildNote(row: PayrollExportRow): string {
  const parts: string[] = []
  if (row.note) parts.push(row.note)
  if (row.securityDepositInstallmentNo && row.securityDepositTotalInstallments) {
    parts.push(`(เงินประกัน ${row.securityDepositInstallmentNo}/${row.securityDepositTotalInstallments})`)
  }
  return parts.join(' ')
}

function buildDerived(row: PayrollExportRow) {
  const td = parseTaxDetail(row.taxDetail)
  const tax40_1 = td?.tax40_1 ?? 0
  const tax40_2 = td?.tax40_2 ?? 0
  const totalIncome = n(
    row.baseSalary + row.positionAllowance + row.diligenceAllowance + row.backPay +
    row.otherAddition + row.professionalFee + row.commission,
  )
  const attendanceDeduction = n(row.lateDeduction + row.absentDeduction + row.unpaidLeave + row.earlyLeaveDeduction)
  const totalDeduction = n(
    row.socialSecurity + tax40_1 + tax40_2 + row.professionalFeeTax + attendanceDeduction + row.otherDeduction,
  )
  const monthlyNet = n(totalIncome - totalDeduction)
  return { tax40_1, tax40_2, totalIncome, attendanceDeduction, totalDeduction, monthlyNet }
}

function writeGroupHeader(ws: ExcelJS.Worksheet, rowNum: number) {
  let gStart = 0
  for (let i = 0; i < COLUMNS.length; i++) {
    const g = COLUMNS[i].group
    const nextG = i + 1 < COLUMNS.length ? COLUMNS[i + 1].group : null
    if (nextG !== g || i === COLUMNS.length - 1) {
      const from = gStart + 1
      const to = i + 1
      if (from < to) ws.mergeCells(rowNum, from, rowNum, to)
      const cell = ws.getCell(rowNum, from)
      cell.value = g
      cell.font = { bold: true, size: 9, color: { argb: 'FF1E3A8A' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
      cell.border = EXCEL_BORDER_THIN
      gStart = i + 1
    }
  }
  ws.getRow(rowNum).height = 20
}

function writeSignatureBlock(ws: ExcelJS.Worksheet, startRow: number, signers: { role: string; name?: string }[]) {
  const colCount = COLUMNS.length
  const third = Math.floor(colCount / 3)
  const blocks = [
    { from: 1, to: Math.max(1, third - 1) },
    { from: third + 1, to: Math.max(third + 1, third * 2) },
    { from: third * 2 + 1, to: colCount },
  ]
  const lineRow = startRow
  const nameRow = startRow + 1
  const roleRow = startRow + 2
  blocks.forEach((b, i) => {
    const signer = signers[i]
    if (!signer) return
    if (b.from < b.to) {
      ws.mergeCells(lineRow, b.from, lineRow, b.to)
      ws.mergeCells(nameRow, b.from, nameRow, b.to)
      ws.mergeCells(roleRow, b.from, roleRow, b.to)
    }
    const lineCell = ws.getCell(lineRow, b.from)
    lineCell.value = 'ลงชื่อ......................................................................'
    lineCell.alignment = { horizontal: 'center' }
    lineCell.font = { size: 10 }
    const nameCell = ws.getCell(nameRow, b.from)
    nameCell.value = signer.name ? `( ${signer.name} )` : '( .............................. )'
    nameCell.alignment = { horizontal: 'center' }
    nameCell.font = { size: 10 }
    const roleCell = ws.getCell(roleRow, b.from)
    roleCell.value = signer.role
    roleCell.alignment = { horizontal: 'center' }
    roleCell.font = { size: 10 }
  })
}

/** สร้าง 1 worksheet ต่อ 1 สาขา — เรียงฝ่าย → แผนก → ชื่อพนักงาน ตามที่ยืนยัน
 * (CompanyBranch ไม่มี sortOrder ของตัวเอง แต่ Division/Department มีอยู่
 * แล้ว จึงใช้เรียงชั้นในของแต่ละสาขา) */
export async function buildPayrollExcel(
  rowsByBranch: Map<string, PayrollExportRow[]>,
  meta: PayrollExportMeta,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'HRFlow'
  const colCount = COLUMNS.length

  for (const [branchName, rawRows] of rowsByBranch) {
    const rows = [...rawRows].sort((a, b) => {
      if (a.divisionSortOrder !== b.divisionSortOrder) return a.divisionSortOrder - b.divisionSortOrder
      if ((a.divisionName ?? '') !== (b.divisionName ?? '')) return (a.divisionName ?? '').localeCompare(b.divisionName ?? '')
      if (a.departmentSortOrder !== b.departmentSortOrder) return a.departmentSortOrder - b.departmentSortOrder
      if ((a.departmentName ?? '') !== (b.departmentName ?? '')) return (a.departmentName ?? '').localeCompare(b.departmentName ?? '')
      return (a.employeeId ?? '').localeCompare(b.employeeId ?? '') || a.name.localeCompare(b.name)
    })

    const sheetName = branchName.replace(/[\\/*?[\]:]/g, '').slice(0, 31) || 'สาขา'
    const ws = wb.addWorksheet(sheetName, {
      properties: { defaultRowHeight: 18 },
      // แนวนอน, บีบให้พอดี 1 หน้ากว้าง (สูงกี่หน้าก็ได้ — fitToHeight: 0),
      // A4, margin แคบพอไม่ให้เสียเนื้อที่แต่ยังพิมพ์ครบ
      pageSetup: {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: 9, // A4
        margins: { top: 0.5, bottom: 0.5, left: 0.3, right: 0.3, header: 0.2, footer: 0.2 },
      },
    })
    COLUMNS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width })

    const titleRow = 1
    const periodRow = 2
    const groupRow = 3
    const headerRow = 4
    let dataRow = 5

    // Freeze แถวหัวตารางทั้งหมด (title/period/group/header = แถว 1-4) ไว้
    // บนจอเสมอเวลาเลื่อนดูรายชื่อยาวๆ
    ws.views = [{ state: 'frozen', ySplit: headerRow, activeCell: `A${dataRow}` }]

    ws.mergeCells(titleRow, 1, titleRow, colCount)
    const titleCell = ws.getCell(titleRow, 1)
    titleCell.value = branchName
    titleCell.font = { bold: true, size: 14, color: { argb: 'FF0F172A' } }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(titleRow).height = 26

    ws.mergeCells(periodRow, 1, periodRow, colCount)
    const periodCell = ws.getCell(periodRow, 1)
    periodCell.value = `ประจำเดือน ${meta.monthLabel} ${meta.year} ${formatPayrollPeriodCaption(meta.month, meta.year)}`
    periodCell.font = { size: 11, color: { argb: 'FF334155' } }
    periodCell.alignment = { horizontal: 'center' }

    writeGroupHeader(ws, groupRow)

    const hRow = ws.getRow(headerRow)
    COLUMNS.forEach((col, i) => {
      const cell = hRow.getCell(i + 1)
      cell.value = col.header
      cell.font = { bold: true, size: 9.5, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } }
      cell.border = EXCEL_BORDER_HEADER
      cell.alignment = excelAlign(col.align)
    })
    hRow.height = 26

    const totals = {
      baseSalary: 0, positionAllowance: 0, diligenceAllowance: 0, backPay: 0, otherAddition: 0,
      professionalFee: 0, commission: 0, totalIncome: 0, ss: 0, tax40_1: 0, tax40_2: 0, tax40_6: 0,
      attendanceDeduction: 0, otherDeduction: 0, totalDeduction: 0, monthlyNet: 0,
      securityDeposit: 0, studentLoan: 0, netSalary: 0,
    }

    let currentDivision: string | null | undefined
    let currentDepartment: string | null | undefined
    let no = 0

    for (const row of rows) {
      if (row.divisionName !== currentDivision || row.departmentName !== currentDepartment) {
        ws.mergeCells(dataRow, 1, dataRow, colCount)
        const sectionCell = ws.getCell(dataRow, 1)
        sectionCell.value = [row.divisionName, row.departmentName].filter(Boolean).join(' / ') || 'ไม่ระบุฝ่าย/แผนก'
        sectionCell.font = { bold: true, size: 10, color: { argb: 'FF1E3A8A' } }
        sectionCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } }
        sectionCell.alignment = { horizontal: 'left', vertical: 'middle' }
        dataRow++
        currentDivision = row.divisionName
        currentDepartment = row.departmentName
      }

      no++
      const d = buildDerived(row)
      const zebra = no % 2 === 0
      const r = ws.getRow(dataRow)

      textCell(r.getCell(1), String(no), COLUMNS[0], { zebra })
      textCell(r.getCell(2), row.name, COLUMNS[1], { zebra })
      textCell(r.getCell(3), row.position ?? '-', COLUMNS[2], { zebra })
      moneyCell(r.getCell(4), row.baseSalary, { zebra })
      moneyCell(r.getCell(5), row.positionAllowance, { zebra })
      moneyCell(r.getCell(6), row.diligenceAllowance, { zebra })
      moneyCell(r.getCell(7), row.backPay, { zebra })
      moneyCell(r.getCell(8), row.otherAddition, { zebra })
      moneyCell(r.getCell(9), row.professionalFee, { zebra })
      moneyCell(r.getCell(10), row.commission, { zebra })
      moneyCell(r.getCell(11), d.totalIncome, { zebra, bold: true })
      moneyCell(r.getCell(12), row.socialSecurity, { zebra })
      moneyCell(r.getCell(13), d.tax40_1, { zebra })
      moneyCell(r.getCell(14), d.tax40_2, { zebra })
      moneyCell(r.getCell(15), row.professionalFeeTax, { zebra })
      moneyCell(r.getCell(16), d.attendanceDeduction, { zebra })
      moneyCell(r.getCell(17), row.otherDeduction, { zebra })
      moneyCell(r.getCell(18), d.totalDeduction, { zebra, bold: true })
      moneyCell(r.getCell(19), d.monthlyNet, { zebra, bold: true })
      moneyCell(r.getCell(20), row.securityDepositDeduction, { zebra, negative: row.securityDepositDeduction > 0 })
      moneyCell(r.getCell(21), row.studentLoanDeduction, { zebra, negative: row.studentLoanDeduction > 0 })
      moneyCell(r.getCell(22), row.netSalary, { zebra, bold: true })
      textCell(r.getCell(23), buildNote(row), COLUMNS[22], { zebra })

      totals.baseSalary += row.baseSalary
      totals.positionAllowance += row.positionAllowance
      totals.diligenceAllowance += row.diligenceAllowance
      totals.backPay += row.backPay
      totals.otherAddition += row.otherAddition
      totals.professionalFee += row.professionalFee
      totals.commission += row.commission
      totals.totalIncome += d.totalIncome
      totals.ss += row.socialSecurity
      totals.tax40_1 += d.tax40_1
      totals.tax40_2 += d.tax40_2
      totals.tax40_6 += row.professionalFeeTax
      totals.attendanceDeduction += d.attendanceDeduction
      totals.otherDeduction += row.otherDeduction
      totals.totalDeduction += d.totalDeduction
      totals.monthlyNet += d.monthlyNet
      totals.securityDeposit += row.securityDepositDeduction
      totals.studentLoan += row.studentLoanDeduction
      totals.netSalary += row.netSalary

      dataRow++
    }

    if (rows.length === 0) {
      ws.mergeCells(dataRow, 1, dataRow, colCount)
      const c = ws.getCell(dataRow, 1)
      c.value = 'ไม่มีข้อมูลในเดือนนี้'
      c.alignment = { horizontal: 'center' }
      c.font = { italic: true, color: { argb: 'FF94A3B8' } }
      dataRow++
    } else {
      const tr = ws.getRow(dataRow)
      textCell(tr.getCell(1), 'รวม', COLUMNS[0], { bold: true })
      ws.mergeCells(dataRow, 2, dataRow, 3)
      textCell(tr.getCell(2), '', COLUMNS[1], { bold: true })
      moneyCell(tr.getCell(4), n(totals.baseSalary), { bold: true })
      moneyCell(tr.getCell(5), n(totals.positionAllowance), { bold: true })
      moneyCell(tr.getCell(6), n(totals.diligenceAllowance), { bold: true })
      moneyCell(tr.getCell(7), n(totals.backPay), { bold: true })
      moneyCell(tr.getCell(8), n(totals.otherAddition), { bold: true })
      moneyCell(tr.getCell(9), n(totals.professionalFee), { bold: true })
      moneyCell(tr.getCell(10), n(totals.commission), { bold: true })
      moneyCell(tr.getCell(11), n(totals.totalIncome), { bold: true })
      moneyCell(tr.getCell(12), n(totals.ss), { bold: true })
      moneyCell(tr.getCell(13), n(totals.tax40_1), { bold: true })
      moneyCell(tr.getCell(14), n(totals.tax40_2), { bold: true })
      moneyCell(tr.getCell(15), n(totals.tax40_6), { bold: true })
      moneyCell(tr.getCell(16), n(totals.attendanceDeduction), { bold: true })
      moneyCell(tr.getCell(17), n(totals.otherDeduction), { bold: true })
      moneyCell(tr.getCell(18), n(totals.totalDeduction), { bold: true })
      moneyCell(tr.getCell(19), n(totals.monthlyNet), { bold: true })
      moneyCell(tr.getCell(20), n(totals.securityDeposit), { bold: true, negative: totals.securityDeposit > 0 })
      moneyCell(tr.getCell(21), n(totals.studentLoan), { bold: true, negative: totals.studentLoan > 0 })
      moneyCell(tr.getCell(22), n(totals.netSalary), { bold: true })
      textCell(tr.getCell(23), '', COLUMNS[22], { bold: true })
      tr.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } } })
      dataRow++
    }

    ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: dataRow - 1, column: colCount } }

    const signers = meta.signers ?? [
      { role: 'ฝ่ายบุคคล/ผู้จัดทำ' },
      { role: 'ผจก. ฝ่ายบัญชีและการเงิน ผู้ตรวจสอบ' },
      { role: 'กรรมการผู้จัดการ/ผู้อนุมัติ' },
    ]
    writeSignatureBlock(ws, dataRow + 3, signers)
  }

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
