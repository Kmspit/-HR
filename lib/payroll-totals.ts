import { roundMoney } from '@/lib/payroll-late-deduction'
import { computeMonthlyTax } from '@/lib/payroll-tax'
import { SS_RATE, SS_MAX } from '@/lib/payroll-constants'

/**
 * รวมสูตรคำนวณ SS/ภาษี/netSalary ของ Payroll ไว้จุดเดียว — ทั้ง generate route
 * (ตอนสร้าง/regenerate) และ PATCH /api/payroll/[id] (ตอน HR แก้ backPay/
 * commission ทีหลัง) ต้องได้ตัวเลขเดียวกันเป๊ะสำหรับ input เดียวกัน
 *
 * baseSalary ในที่นี้คือฐานเงินที่ "จ่ายจริง" ของงวดนี้แล้ว (periodBaseSalary
 * ของ MONTHLY ที่ prorate แล้ว หรือ periodEarnings ของ DAILY) — ไม่ใช่ User.baseSalary
 * ดิบๆ lateDeduction/absentDeduction/unpaidLeaveDeduction/earlyLeaveDeduction
 * เป็น 0 สำหรับ DAILY (ระบบไม่หักพวกนี้แยกสำหรับพนักงานรายวันอยู่แล้ว)
 *
 * ฐาน SS (ยืนยัน 2026-09): baseSalary + positionAllowance + backPay เข้าฐาน,
 * diligenceAllowance/commission ไม่เข้า
 * ฐานภาษี 40(1)+40(2) (ยืนยัน 2026-09): baseSalary + positionAllowance +
 * diligenceAllowance + backPay + commission รวมก้อนเดียวเข้า computeMonthlyTax
 * — ไม่รวมค่าวิชาชีพ 40(6) (professionalFee, คำนวณภาษีคนละระบบ 3% flat แยกต่างหาก)
 * กยศ./เงินประกันหักหลังภาษี ไม่กระทบ taxableIncome
 */
export type PayrollTotalsInput = {
  /** ใช้คำนวณฐาน SS และ grossIncome ภาษี — เป็นเงินเดือน "เต็มจำนวน" ไม่ prorate
   * (พฤติกรรมเดิมของระบบ: SS/ภาษีไม่ปรับตามสัดส่วนวันทำงานแม้เดือนนั้น prorate
   * บาง เหมือนกันทั้งก่อน/หลัง feature นี้ — ดูคอมเมนต์ที่ generate route) */
  taxSsBaseSalary: number
  /** ใช้บวกเข้า netSalary จริง — MONTHLY: periodBaseSalary (prorate แล้วถ้าเข้า
   * งานกลางเดือน), DAILY: เท่ากับ taxSsBaseSalary เสมอ (ไม่มีแนวคิด prorate) */
  payoutBaseSalary: number
  positionAllowance: number
  diligenceAllowance: number
  backPay: number
  commission: number
  professionalFee: number
  professionalFeeTax: number
  studentLoanDeduction: number
  securityDepositDeduction: number
  lateDeduction: number
  absentDeduction: number
  unpaidLeaveDeduction: number
  earlyLeaveDeduction: number
  socialSecurityEnabled: boolean
}

export type PayrollTotalsResult = {
  socialSecurity: number
  taxDeduction: number
  taxDetail: string
  netSalary: number
}

export function computePayrollTotals(input: PayrollTotalsInput): PayrollTotalsResult {
  const ssBase = input.taxSsBaseSalary + input.positionAllowance + input.backPay
  let socialSecurity = 0
  if (input.socialSecurityEnabled && ssBase > 0) {
    socialSecurity = roundMoney(Math.min(ssBase * SS_RATE, SS_MAX))
  }

  const grossIncome =
    input.taxSsBaseSalary + input.positionAllowance + input.diligenceAllowance +
    input.backPay + input.commission
  const taxResult = computeMonthlyTax(grossIncome, socialSecurity)
  const taxDeduction = taxResult.monthlyWithholding

  // แยกยอดภาษีที่หักไว้เป็นส่วนของ 40(1) (เงินเดือน/ค่าตำแหน่ง/เบี้ยขยัน/
  // ตกเบิก) กับ 40(2) (คอมมิชชั่น) ตามสัดส่วนรายได้ — ใช้แสดงแยกช่องในรายงาน/
  // ภ.ง.ด.1 เท่านั้น (นักบัญชียื่นแบบจริงต้องแยก 2 ช่องนี้) ไม่กระทบยอดหักจริง
  // ที่หักจากพนักงานเลย เพราะ taxDeduction ยังเป็นก้อนเดียวเท่าเดิม
  const salaryIncome40_1 =
    input.taxSsBaseSalary + input.positionAllowance + input.diligenceAllowance + input.backPay
  const commissionIncome40_2 = input.commission
  const tax40_2 = grossIncome > 0 ? roundMoney((taxDeduction * commissionIncome40_2) / grossIncome) : 0
  const tax40_1 = roundMoney(taxDeduction - tax40_2)
  const taxDetailWithBreakdown = JSON.stringify({
    ...taxResult,
    salaryIncome40_1,
    commissionIncome40_2,
    tax40_1,
    tax40_2,
  })

  const netSalary = roundMoney(
    input.payoutBaseSalary +
    input.positionAllowance +
    input.diligenceAllowance +
    input.backPay +
    input.commission +
    input.professionalFee -
    input.professionalFeeTax -
    input.lateDeduction -
    input.absentDeduction -
    input.unpaidLeaveDeduction -
    input.earlyLeaveDeduction -
    socialSecurity -
    taxDeduction -
    input.studentLoanDeduction -
    input.securityDepositDeduction,
  )

  return {
    socialSecurity,
    taxDeduction,
    taxDetail: taxDetailWithBreakdown,
    netSalary,
  }
}
