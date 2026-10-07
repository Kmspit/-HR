import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'
import {
  buildPayslipLineItems,
  formatPayslipAmount,
  type PayslipLineItemSource,
} from '@/lib/payslip-line-items'
import { computePayrollTotals } from '@/lib/payroll-totals'

const EARNING_LABELS = [
  'ค่าแรง', 'ค่าตำแหน่ง', 'ค่าประสบการณ์', 'ค่าภาษา', 'เบี้ยขยัน', 'ค่าข้าว',
  'ค่าวิชาชีพ', 'ค่าคอมมิชชั่น', 'เงินคืนอื่น ๆ', 'OT1', 'OT1.5', 'OT2', 'OT3',
]
const DEDUCTION_LABELS = [
  'หักภาษี', 'ภงด1(40)(1)', 'ภงด1(40)(2)', 'หักประกันสังคม', 'หักเงินประกัน',
  'ขาดงาน/มาสาย', 'เงินยืมบริษัท', 'หักอื่นๆ',
]

function zeroSource(overrides: Partial<PayslipLineItemSource> = {}): PayslipLineItemSource {
  return {
    baseSalary: 0,
    socialSecurity: 0,
    lateDeduction: 0,
    lateDays: 0,
    lateMinutes: 0,
    absentDeduction: 0,
    absentDays: 0,
    unpaidLeave: 0,
    ...overrides,
  }
}

describe('buildPayslipLineItems — fixed rows', () => {
  it('always shows every main row in the agreed order, even when everything is 0', () => {
    const items = buildPayslipLineItems(zeroSource())
    expect(items.earnings.map((i) => i.label)).toEqual(EARNING_LABELS)
    expect(items.deductions.map((i) => i.label)).toEqual(DEDUCTION_LABELS)
    expect(items.totalEarnings).toBe(0)
    expect(items.totalDeductions).toBe(0)
  })

  it('items the system has no field for are null (always "-")', () => {
    const items = buildPayslipLineItems(zeroSource({ baseSalary: 30000 }))
    const nullLabels = [...items.earnings, ...items.deductions].filter((i) => i.amount === null).map((i) => i.label)
    expect(nullLabels).toEqual([
      'ค่าประสบการณ์', 'ค่าภาษา', 'ค่าข้าว', 'เงินคืนอื่น ๆ', 'OT1', 'OT1.5', 'OT2', 'OT3', 'เงินยืมบริษัท',
    ])
  })

  it('formatPayslipAmount shows "-" for 0 and null, 2 decimals otherwise', () => {
    expect(formatPayslipAmount(0)).toBe('-')
    expect(formatPayslipAmount(null)).toBe('-')
    expect(formatPayslipAmount(1234.5)).toBe('1,234.50')
  })

  it('extra rows (OT lump sum / bonus / back pay / other income / กยศ.) appear only when non-zero, after the main rows', () => {
    expect(buildPayslipLineItems(zeroSource()).earnings).toHaveLength(EARNING_LABELS.length)
    const items = buildPayslipLineItems(zeroSource({
      overtimePay: 500, bonus: 1000, backPay: 200, otherAddition: 50, studentLoanDeduction: 1500,
    }))
    expect(items.earnings.slice(EARNING_LABELS.length).map((i) => [i.label, i.amount])).toEqual([
      ['ค่าล่วงเวลา (ไม่แยกอัตรา)', 500],
      ['โบนัส', 1000],
      ['ตกเบิก', 200],
      ['รายได้อื่นๆ', 50],
    ])
    expect(items.deductions.slice(DEDUCTION_LABELS.length).map((i) => [i.label, i.amount])).toEqual([['กยศ.', 1500]])
  })

  it('DAILY shows days × rate as a detail line under ค่าแรง', () => {
    const items = buildPayslipLineItems(zeroSource({ baseSalary: 8600, payType: 'DAILY', daysWorked: 21.5, dailyRateUsed: 400 }))
    expect(items.earnings[0]).toMatchObject({ label: 'ค่าแรง', amount: 8600, detail: ['รายวัน 21.50 วัน × ฿400.00'] })
  })

  it('ขาดงาน/มาสาย groups late + absent + unpaid leave + early leave, with a detail line per non-zero part', () => {
    const items = buildPayslipLineItems(zeroSource({
      lateDeduction: 10, lateDays: 1, lateMinutes: 15, absentDeduction: 1000, absentDays: 1, unpaidLeave: 0, earlyLeaveDeduction: 500,
    }))
    const row = items.deductions.find((i) => i.key === 'attendance')!
    expect(row.amount).toBe(1510)
    expect(row.detail).toHaveLength(3)
  })

  it('หักเงินประกัน shows the installment as a detail line', () => {
    const items = buildPayslipLineItems(zeroSource({
      securityDepositDeduction: 833.33, securityDepositInstallmentNo: 2, securityDepositTotalInstallments: 6,
    }))
    expect(items.deductions.find((i) => i.key === 'securityDeposit')).toMatchObject({ amount: 833.33, detail: ['งวด 2/6'] })
  })
})

describe('buildPayslipLineItems — tax columns', () => {
  const byKey = (src: PayslipLineItemSource) =>
    Object.fromEntries(buildPayslipLineItems(src).deductions.map((i) => [i.key, i.amount]))

  it('NORMAL: progressive tax split into ภงด1(40)(1)/(40)(2) from taxDetail; หักภาษี stays 0', () => {
    const totals = computePayrollTotals({
      year: 2026,
      baseSalary: 35000, positionAllowance: 0, diligenceAllowance: 0,
      backPay: 0, commission: 20000, overtimePay: 0, bonus: 0, professionalFee: 0, professionalFeeTax: 0,
      studentLoanDeduction: 0, securityDepositDeduction: 0, lateDeduction: 0, absentDeduction: 0,
      unpaidLeaveDeduction: 0, earlyLeaveDeduction: 0, taxScheme: 'NORMAL', socialSecurityEnabled: true,
    })
    const d = byKey(zeroSource({
      baseSalary: 35000, commission: 20000, taxScheme: 'NORMAL', taxDeduction: totals.taxDeduction, taxDetail: totals.taxDetail,
    }))
    expect(d.withholdingTax).toBe(0)
    expect(d.pnd1_40_1! + d.pnd1_40_2!).toBeCloseTo(totals.taxDeduction, 2)
    expect(d.pnd1_40_2).toBeGreaterThan(0)
  })

  it('NORMAL with an old taxDetail (no breakdown) and no commission: all of it is 40(1)', () => {
    const d = byKey(zeroSource({ baseSalary: 35000, taxDeduction: 414.58, taxDetail: '{"monthlyWithholding":414.58}' }))
    expect(d).toMatchObject({ withholdingTax: 0, pnd1_40_1: 414.58, pnd1_40_2: 0 })
  })

  it('null taxScheme (rows before the snapshot existed) is treated as NORMAL, same as computePayrollTotals', () => {
    const d = byKey(zeroSource({ baseSalary: 35000, taxScheme: null, taxDeduction: 414.58 }))
    expect(d).toMatchObject({ withholdingTax: 0, pnd1_40_1: 414.58 })
  })

  it('OFF_SYSTEM_WHT: the 3% goes to หักภาษี (ภงด.3), never to ภงด1', () => {
    const d = byKey(zeroSource({ baseSalary: 35000, taxScheme: 'OFF_SYSTEM_WHT', taxDeduction: 1050 }))
    expect(d).toMatchObject({ withholdingTax: 1050, pnd1_40_1: 0, pnd1_40_2: 0 })
  })

  it('ภงด.3 40(6) on professional fees goes to หักภาษี, added to any OFF_SYSTEM_WHT 3%', () => {
    expect(byKey(zeroSource({ professionalFee: 5000, professionalFeeTax: 150, taxDeduction: 414.58 })))
      .toMatchObject({ withholdingTax: 150, pnd1_40_1: 414.58 })
    const items = buildPayslipLineItems(zeroSource({
      professionalFee: 5000, professionalFeeTax: 150, taxScheme: 'OFF_SYSTEM_WHT', taxDeduction: 1050,
    }))
    expect(items.deductions[0]).toMatchObject({ label: 'หักภาษี', amount: 1200 })
    expect(items.deductions[0].detail).toHaveLength(2)
  })
})

describe('buildPayslipLineItems — reconciles with netSalary', () => {
  type Case = Parameters<typeof computePayrollTotals>[0] & { payType?: string; daysWorked?: number; dailyRateUsed?: number }
  const base: Case = {
    year: 2026,
    baseSalary: 35000, positionAllowance: 3000, diligenceAllowance: 500,
    backPay: 1200, commission: 4000, overtimePay: 800, bonus: 2000, professionalFee: 5000, professionalFeeTax: 150,
    studentLoanDeduction: 1500, securityDepositDeduction: 833.33, lateDeduction: 72.92, absentDeduction: 1346.15,
    unpaidLeaveDeduction: 1346.15, earlyLeaveDeduction: 673.08, taxScheme: 'NORMAL', socialSecurityEnabled: true,
  }
  const cases: [string, Case][] = [
    ['NORMAL with every field set', base],
    ['OFF_SYSTEM_WHT with every field set', { ...base, taxScheme: 'OFF_SYSTEM_WHT' }],
    ['DAILY', {
      ...base, baseSalary: 8600, payType: 'DAILY', daysWorked: 21.5, dailyRateUsed: 400,
      lateDeduction: 0, absentDeduction: 0, unpaidLeaveDeduction: 0, earlyLeaveDeduction: 0,
    }],
  ]

  it.each(cases)('%s: รวมรายได้ − รวมรายการหัก = netSalary', (_name, c) => {
    const totals = computePayrollTotals(c)
    const items = buildPayslipLineItems({
      baseSalary: c.baseSalary,
      payType: c.payType,
      daysWorked: c.daysWorked,
      dailyRateUsed: c.dailyRateUsed,
      positionAllowance: c.positionAllowance,
      diligenceAllowance: c.diligenceAllowance,
      professionalFee: c.professionalFee,
      commission: c.commission,
      overtimePay: c.overtimePay,
      bonus: c.bonus,
      backPay: c.backPay,
      taxScheme: c.taxScheme,
      taxDeduction: totals.taxDeduction,
      taxDetail: totals.taxDetail,
      professionalFeeTax: c.professionalFeeTax,
      socialSecurity: totals.socialSecurity,
      securityDepositDeduction: c.securityDepositDeduction,
      lateDeduction: c.lateDeduction,
      lateDays: 1,
      lateMinutes: 18,
      absentDeduction: c.absentDeduction,
      absentDays: 1,
      unpaidLeave: c.unpaidLeaveDeduction,
      earlyLeaveDeduction: c.earlyLeaveDeduction,
      studentLoanDeduction: c.studentLoanDeduction,
    })
    expect(totals.negativeClampAmount).toBe(0)
    expect(items.totalEarnings - items.totalDeductions).toBeCloseTo(totals.netSalary, 2)
  })
})

describe('buildPayslipLineItems — no Payroll money field can silently vanish from the slip', () => {
  // Float fields on Payroll that are NOT a slip line item on purpose: the result
  // (netSalary) or a rate/count shown inside another row's detail.
  const NOT_A_LINE_ITEM = new Set(['netSalary', 'dailyRateUsed', 'daysWorked'])

  const payrollModel = Prisma.dmmf.datamodel.models.find((m) => m.name === 'Payroll')!
  const moneyFields = payrollModel.fields
    .filter((f) => f.kind === 'scalar' && f.type === 'Float' && !NOT_A_LINE_ITEM.has(f.name))
    .map((f) => f.name)

  it('the Payroll model still has the money fields this test expects', () => {
    expect(moneyFields).toEqual(expect.arrayContaining(['baseSalary', 'socialSecurity', 'taxDeduction', 'professionalFeeTax']))
  })

  it.each(moneyFields)('Payroll.%s changes the slip totals when non-zero', (field) => {
    const src = zeroSource({ [field]: 100 } as Partial<PayslipLineItemSource>)
    const items = buildPayslipLineItems(src)
    expect(items.totalEarnings + items.totalDeductions).toBe(100)
  })
})
