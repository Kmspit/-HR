import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { buildPayrollExcel, type PayrollExportRow } from '@/lib/payroll-excel-export'

function makeRow(overrides: Partial<PayrollExportRow> = {}): PayrollExportRow {
  return {
    employeeId: 'E001',
    name: 'น.ส.ทดสอบ ระบบ',
    position: 'เสมียนงานคดี',
    branchName: 'สาขานครราชสีมา',
    divisionName: 'ฝ่ายบุคคล',
    divisionSortOrder: 1,
    departmentName: 'แผนกสรรหา',
    departmentSortOrder: 1,
    baseSalary: 15000,
    positionAllowance: 500,
    diligenceAllowance: 300,
    backPay: 0,
    otherAddition: 0,
    professionalFee: 2000,
    commission: 1000,
    socialSecurity: 750,
    professionalFeeTax: 60,
    taxDetail: JSON.stringify({
      annualGross: 214800, incomeDeduction: 100000, personalAllowance: 60000,
      annualSocialSecurity: 9000, taxableIncome: 45800, annualTax: 0, monthlyWithholding: 100,
      salaryIncome40_1: 15800, commissionIncome40_2: 1000, tax40_1: 94, tax40_2: 6,
    }),
    lateDeduction: 20,
    absentDeduction: 0,
    unpaidLeave: 0,
    earlyLeaveDeduction: 0,
    otherDeduction: 0,
    securityDepositDeduction: 500,
    securityDepositInstallmentNo: 3,
    securityDepositTotalInstallments: 6,
    studentLoanDeduction: 1200,
    netSalary: 16800,
    note: null,
    ...overrides,
  }
}

describe('buildPayrollExcel', () => {
  it('creates one worksheet per branch with the expected header row and data', async () => {
    const rowsByBranch = new Map<string, PayrollExportRow[]>([
      ['สาขานครราชสีมา', [makeRow()]],
      ['สาขาอุบลราชธานี', [makeRow({ branchName: 'สาขาอุบลราชธานี', name: 'นายทดสอบ สอง', employeeId: 'E002' })]],
    ])

    const buffer = await buildPayrollExcel(rowsByBranch, { month: 8, year: 2569, monthLabel: 'สิงหาคม' })
    expect(buffer.length).toBeGreaterThan(0)

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer as any)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['สาขานครราชสีมา', 'สาขาอุบลราชธานี'])

    const ws = wb.getWorksheet('สาขานครราชสีมา')!
    // Row 4 = header row (title=1, period=2, group=3, header=4)
    const headerValues = ws.getRow(4).values as unknown[]
    expect(headerValues).toContain('ชื่อ - สกุลพนักงาน')
    expect(headerValues).toContain('ค่าตำแหน่ง')
    expect(headerValues).toContain('เบี้ยขยัน')
    expect(headerValues).toContain('ภงด.1 40(1)')
    expect(headerValues).toContain('ภงด.1 40(2)')
    expect(headerValues).toContain('ภงด.3 40(6)')
    expect(headerValues).toContain('ประกันงาน')
    expect(headerValues).toContain('กยศ')
    expect(headerValues).toContain('จ่ายสุทธิ')
  })

  it('includes the security-deposit installment note as "(เงินประกัน N/M)"', async () => {
    const rowsByBranch = new Map<string, PayrollExportRow[]>([
      ['สาขานครราชสีมา', [makeRow()]],
    ])
    const buffer = await buildPayrollExcel(rowsByBranch, { month: 8, year: 2569, monthLabel: 'สิงหาคม' })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer as any)
    const ws = wb.getWorksheet('สาขานครราชสีมา')!

    // Row 5 = section header (division/department), row 6 = first data row
    const dataRow = ws.getRow(6)
    const noteCellValue = dataRow.getCell(23).value
    expect(noteCellValue).toBe('(เงินประกัน 3/6)')
  })

  it('writes a totals row ("รวม") summing all employee rows in the branch', async () => {
    const rowsByBranch = new Map<string, PayrollExportRow[]>([
      ['สาขานครราชสีมา', [
        makeRow({ netSalary: 16800 }),
        makeRow({ name: 'คนที่สอง', employeeId: 'E003', netSalary: 20000, securityDepositInstallmentNo: null, securityDepositTotalInstallments: null }),
      ]],
    ])
    const buffer = await buildPayrollExcel(rowsByBranch, { month: 8, year: 2569, monthLabel: 'สิงหาคม' })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer as any)
    const ws = wb.getWorksheet('สาขานครราชสีมา')!

    let totalRowFound = false
    ws.eachRow((row) => {
      if (row.getCell(1).value === 'รวม') {
        totalRowFound = true
        expect(row.getCell(22).value).toBe(36800) // 16800 + 20000
      }
    })
    expect(totalRowFound).toBe(true)
  })

  it('handles a branch with zero payroll rows without throwing', async () => {
    const rowsByBranch = new Map<string, PayrollExportRow[]>([
      ['สาขาว่าง', []],
    ])
    const buffer = await buildPayrollExcel(rowsByBranch, { month: 1, year: 2569, monthLabel: 'มกราคม' })
    expect(buffer.length).toBeGreaterThan(0)
  })

  it('gives every money column enough width for an 8-digit total with decimals/commas (no more "#####")', async () => {
    const rowsByBranch = new Map<string, PayrollExportRow[]>([
      ['สาขานครราชสีมา', [makeRow({ baseSalary: 12_345_678.9 })]],
    ])
    const buffer = await buildPayrollExcel(rowsByBranch, { month: 8, year: 2569, monthLabel: 'สิงหาคม' })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer as any)
    const ws = wb.getWorksheet('สาขานครราชสีมา')!

    // "99,999,999.99" is 13 characters — every money column (everything
    // except ที่/name/position/note) must be wide enough to show it in full,
    // never truncated to "#####" by Excel.
    const textColumns = new Set([1, 2, 3, 23]) // ที่, name, position, note
    for (let col = 1; col <= 23; col++) {
      if (textColumns.has(col)) continue
      const width = ws.getColumn(col).width ?? 0
      expect(width).toBeGreaterThanOrEqual(13)
    }
  })

  it('sets landscape A4 print setup with fit-to-width-1-page', async () => {
    const rowsByBranch = new Map<string, PayrollExportRow[]>([
      ['สาขานครราชสีมา', [makeRow()]],
    ])
    const buffer = await buildPayrollExcel(rowsByBranch, { month: 8, year: 2569, monthLabel: 'สิงหาคม' })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer as any)
    const ws = wb.getWorksheet('สาขานครราชสีมา')!

    expect(ws.pageSetup.orientation).toBe('landscape')
    expect(ws.pageSetup.fitToPage).toBe(true)
    expect(ws.pageSetup.fitToWidth).toBe(1)
    expect(ws.pageSetup.fitToHeight).toBe(0)
    expect(ws.pageSetup.paperSize).toBe(9) // A4
  })

  it('freezes the header rows (title/period/group/header) so they stay visible when scrolling', async () => {
    const rowsByBranch = new Map<string, PayrollExportRow[]>([
      ['สาขานครราชสีมา', [makeRow()]],
    ])
    const buffer = await buildPayrollExcel(rowsByBranch, { month: 8, year: 2569, monthLabel: 'สิงหาคม' })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer as any)
    const ws = wb.getWorksheet('สาขานครราชสีมา')!

    const view = ws.views[0] as { state?: string; ySplit?: number }
    expect(view.state).toBe('frozen')
    expect(view.ySplit).toBe(4) // header row is row 4 (title=1, period=2, group=3, header=4)
  })

  it('every worksheet (one per branch) gets its own print setup and frozen header, not just the first', async () => {
    const rowsByBranch = new Map<string, PayrollExportRow[]>([
      ['สาขานครราชสีมา', [makeRow()]],
      ['สาขาอุบลราชธานี', [makeRow({ branchName: 'สาขาอุบลราชธานี' })]],
    ])
    const buffer = await buildPayrollExcel(rowsByBranch, { month: 8, year: 2569, monthLabel: 'สิงหาคม' })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer as any)

    for (const name of ['สาขานครราชสีมา', 'สาขาอุบลราชธานี']) {
      const ws = wb.getWorksheet(name)!
      expect(ws.pageSetup.orientation).toBe('landscape')
      const view = ws.views[0] as { state?: string }
      expect(view.state).toBe('frozen')
    }
  })
})
