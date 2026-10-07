import { roundMoney } from '@/lib/payroll-late-deduction'
import { computeMonthlyTax, computeOffSystemWht, parseTaxDetail } from '@/lib/payroll-tax'
import { computeSocialSecurity } from '@/lib/payroll-constants'

/**
 * รวมสูตรคำนวณ SS/ภาษี/netSalary ของ Payroll ไว้จุดเดียว — ทั้ง generate route
 * (ตอนสร้าง/regenerate) และ PATCH /api/payroll/[id] (ตอน HR แก้ backPay/
 * commission ทีหลัง) ต้องได้ตัวเลขเดียวกันเป๊ะสำหรับ input เดียวกัน
 *
 * baseSalary คือค่าจ้างที่ "จ่ายจริง" ของงวดนี้ (MONTHLY หลัง prorate เข้าใหม่/
 * ลาออกกลางรอบ, DAILY = วันที่มาทำงาน × ค่าแรงรายวัน) — ไม่ใช่ User.baseSalary
 * ดิบๆ และเป็นฐานเดียวทั้ง SS/ภาษี/net (2026-10, fix/payroll-formulas-round1:
 * เดิมแยก taxSsBaseSalary = เงินเดือนเต็มไว้คิด SS/ภาษี ทำให้คนเข้างานกลาง
 * รอบโดนหัก SS/ภาษีเต็มเดือน และ PATCH กับ generate ใช้ฐานไม่ตรงกัน)
 *
 * ฐาน SS: baseSalary + positionAllowance + backPay (เบี้ยขยัน/คอมมิชชั่น/OT/
 * โบนัส ไม่เข้า) — คิดผ่าน computeSocialSecurity (ฐาน 1,650–17,500, ปัดบาทเต็ม)
 * ฐานภาษี 40(1)+40(2): baseSalary + positionAllowance + diligenceAllowance +
 * backPay + commission + overtimePay + bonus รวมก้อนเดียว — ไม่รวมค่าวิชาชีพ
 * 40(6) (professionalFee, คำนวณภาษีคนละระบบ 3% flat แยกต่างหาก) กยศ./เงิน
 * ประกันหักหลังภาษี ไม่กระทบ taxableIncome
 *
 * taxScheme (2026-09) — แกนอิสระจาก payType โดยสิ้นเชิง คุม "วิธีคิดภาษี/SS":
 * - NORMAL: ภาษีขั้นบันได (computeMonthlyTax) + SS ตามปกติ — หรือยอดหักต่อเดือน
 *   ที่ HR กำหนดเองรายคน (monthlyTaxOverride, 2026-10) แทนยอดตามสูตร
 * - OFF_SYSTEM_WHT: ไม่มี SS เลย (บังคับ 0 ไม่สนใจ socialSecurityEnabled),
 *   หัก ณ ที่จ่ายแบบเหมา 3% ของยอดที่จ่ายจริง (ภงด.3) — ไม่สนใจ monthlyTaxOverride
 */
export type PayrollTotalsInput = {
  /** ค่าจ้างที่จ่ายจริงงวดนี้ (หลัง prorate) — ฐานเดียวของ SS/ภาษี/net */
  baseSalary: number
  positionAllowance: number
  diligenceAllowance: number
  backPay: number
  commission: number
  /** ค่าล่วงเวลา (OT) — ยอดก้อนเดียว HR กรอกเอง เข้าฐานภาษีแต่ไม่เข้าฐาน SS */
  overtimePay: number
  /** โบนัส — แยกจาก otherAddition เข้าฐานภาษีแต่ไม่เข้าฐาน SS เหมือน OT */
  bonus: number
  professionalFee: number
  professionalFeeTax: number
  studentLoanDeduction: number
  securityDepositDeduction: number
  lateDeduction: number
  absentDeduction: number
  unpaidLeaveDeduction: number
  earlyLeaveDeduction: number
  socialSecurityEnabled: boolean
  /** 'NORMAL' | 'OFF_SYSTEM_WHT' — ค่าเริ่มต้น 'NORMAL' ถ้าไม่ส่งมา (backward-compat) */
  taxScheme?: string | null
  /** ภาษี ภงด.1 ที่หักต่อเดือน (บาท) ที่ HR กำหนดเองรายคน — null/undefined =
   *  ใช้ยอดตามสูตร มีผลเฉพาะ taxScheme NORMAL */
  monthlyTaxOverride?: number | null
}

export type PayrollTotalsResult = {
  socialSecurity: number
  taxDeduction: number
  taxDetail: string
  netSalary: number
  /** How much the raw calculation fell below 0 before being clamped here
   *  (0 when it didn't go negative) — 2026-09-30 fix, see CONTRIBUTING-
   *  adjacent history: netSalary was never clamped anywhere in the codebase,
   *  so a heavy deduction (most commonly a mid-period new hire's prorated
   *  pay overwhelmed by full-rate absence/unpaid/early-leave deductions)
   *  could produce a negative payslip with no guard rail. Every caller
   *  (generate route, PATCH /api/payroll/[id] — both funnel through this
   *  one function per the file-level comment above) gets the clamp for
   *  free; this field lets each caller build its own "docked over what
   *  they were actually owed" review-me note/warning without recomputing
   *  anything. */
  negativeClampAmount: number
  /** (2026-10) รายได้รวม / ยอดหักรวมของงวดนี้ — ตรงกับ "รวมรายได้ทั้งหมด" /
   *  "รวมรายการหัก" บนสลิป (net = totalIncome − totalDeductions ก่อน clamp) ใช้
   *  เขียนคำเตือนตอนยอดหักรวมมากกว่ารายได้รวม */
  totalIncome: number
  totalDeductions: number
}

export function computePayrollTotals(input: PayrollTotalsInput): PayrollTotalsResult {
  const isOffSystemWht = input.taxScheme === 'OFF_SYSTEM_WHT'

  const ssBase = input.baseSalary + input.positionAllowance + input.backPay
  const socialSecurity =
    !isOffSystemWht && input.socialSecurityEnabled ? computeSocialSecurity(ssBase) : 0

  const grossIncome =
    input.baseSalary + input.positionAllowance + input.diligenceAllowance +
    input.backPay + input.commission + input.overtimePay + input.bonus
  const formulaTax = isOffSystemWht
    ? computeOffSystemWht(grossIncome)
    : computeMonthlyTax(grossIncome, socialSecurity)
  const override =
    !isOffSystemWht && input.monthlyTaxOverride != null && input.monthlyTaxOverride >= 0
      ? roundMoney(input.monthlyTaxOverride)
      : null
  const taxDeduction = override ?? formulaTax.monthlyWithholding

  // แยกยอดภาษีที่หักไว้เป็นส่วนของ 40(1) (เงินเดือน/ค่าตำแหน่ง/เบี้ยขยัน/
  // ตกเบิก) กับ 40(2) (คอมมิชชั่น) ตามสัดส่วนรายได้ — ใช้แสดงแยกช่องในรายงาน/
  // ภ.ง.ด.1 เท่านั้น (นักบัญชียื่นแบบจริงต้องแยก 2 ช่องนี้) ไม่กระทบยอดหักจริง
  // ที่หักจากพนักงานเลย เพราะ taxDeduction ยังเป็นก้อนเดียวเท่าเดิม
  const salaryIncome40_1 =
    input.baseSalary + input.positionAllowance + input.diligenceAllowance + input.backPay
  const commissionIncome40_2 = input.commission
  const tax40_2 = grossIncome > 0 ? roundMoney((taxDeduction * commissionIncome40_2) / grossIncome) : 0
  const tax40_1 = roundMoney(taxDeduction - tax40_2)
  const taxDetailWithBreakdown = JSON.stringify({
    ...formulaTax,
    // monthlyWithholding = ยอดที่หักจริง (ยอดกำหนดเองถ้ามี) — formulaMonthlyWithholding
    // เก็บยอดตามสูตรไว้เทียบเสมอ, monthlyTaxOverride ถูก PATCH /api/payroll/[id]
    // อ่านกลับไปใช้ซ้ำ (snapshot ตอน generate ไม่อ่าน User ปัจจุบัน)
    monthlyWithholding: taxDeduction,
    formulaMonthlyWithholding: formulaTax.monthlyWithholding,
    monthlyTaxOverride: override,
    salaryIncome40_1,
    commissionIncome40_2,
    tax40_1,
    tax40_2,
  })

  const totalIncome = roundMoney(
    input.baseSalary +
    input.positionAllowance +
    input.diligenceAllowance +
    input.backPay +
    input.commission +
    input.overtimePay +
    input.bonus +
    input.professionalFee,
  )
  const totalDeductions = roundMoney(
    input.professionalFeeTax +
    input.lateDeduction +
    input.absentDeduction +
    input.unpaidLeaveDeduction +
    input.earlyLeaveDeduction +
    socialSecurity +
    taxDeduction +
    input.studentLoanDeduction +
    input.securityDepositDeduction,
  )
  const rawNetSalary = roundMoney(totalIncome - totalDeductions)
  const netSalary = Math.max(0, rawNetSalary)
  const negativeClampAmount = rawNetSalary < 0 ? roundMoney(-rawNetSalary) : 0

  return {
    socialSecurity,
    taxDeduction,
    taxDetail: taxDetailWithBreakdown,
    netSalary,
    negativeClampAmount,
    totalIncome,
    totalDeductions,
  }
}

/** ยอดภาษีกำหนดเองที่ snapshot ไว้ใน Payroll.taxDetail ตอน generate — PATCH/
 *  ค่าวิชาชีพที่คำนวณยอดใหม่ทีหลังต้องใช้ยอดเดียวกัน ไม่อ่าน User ปัจจุบัน
 *  (เหตุผลเดียวกับ taxScheme snapshot) */
export function monthlyTaxOverrideFromTaxDetail(taxDetail: string | null | undefined): number | null {
  const override = parseTaxDetail(taxDetail)?.monthlyTaxOverride
  return typeof override === 'number' ? override : null
}
