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
})
