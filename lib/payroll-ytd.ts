import { prisma } from '@/lib/prisma'

export type PayrollYtdTotals = {
  /** รายได้สะสม — grossIncome ปกติเท่านั้น (เงินเดือน/ค่าจ้างรายวัน+ค่าตำแหน่ง+
   * เบี้ยขยัน+ตกเบิก+คอมมิชชั่น+OT+โบนัส) ไม่รวมค่าวิชาชีพ 40(6) (ยืนยัน 2026-09
   * — professionalFee เป็นคนละระบบภาษี รายงานแยกต่างหาก) */
  income: number
  /** ภาษีสะสม — SUM(taxDeduction) เฉพาะเดือนที่ taxScheme='NORMAL' ณ ตอนนั้น */
  taxNormal: number
  /** WHT สะสม — SUM(taxDeduction) เฉพาะเดือนที่ taxScheme='OFF_SYSTEM_WHT' ณ ตอนนั้น */
  taxOffSystemWht: number
  /** ประกันสังคมสะสม — SUM(socialSecurity) ทุกเดือน ไม่แยก taxScheme (OFF_SYSTEM_WHT
   * บังคับ 0 อยู่แล้ว บวกรวมไม่กระทบ) */
  socialSecurity: number
}

export type PayrollYtdRow = {
  baseSalary: number
  positionAllowance: number
  diligenceAllowance: number
  backPay: number
  commission: number
  overtimePay: number
  bonus: number
  taxDeduction: number
  socialSecurity: number
  /** snapshot ของเดือนนั้นจริงๆ ไม่ใช่ User.taxScheme ปัจจุบัน — สำคัญสำหรับ
   * คนที่เปลี่ยน taxScheme กลางปี ต้องแยกยอดตาม scheme ที่ใช้จริงของแต่ละเดือน */
  taxScheme: string | null
}

/**
 * ยอดสะสม 4 ตัวสำหรับออกใบรับรองหักภาษี ณ ที่จ่ายประจำปี (50 ทวิ) — ยืนยัน
 * 2026-09 ครบทั้ง 3 ข้อ:
 * 1) ภาษีสะสม/WHT สะสม เป็นคนละยอด แยกตาม taxScheme ที่ SNAPSHOT ไว้จริงของ
 *    แต่ละเดือน (เผื่อกรณีเปลี่ยน taxScheme กลางปี ไม่ใช่ตาม taxScheme ปัจจุบัน)
 * 2) รายได้สะสม ไม่รวม professionalFee เลย
 * 3) ประกันสังคมสะสม SUM ตรงๆ ทุกเดือน
 *
 * แยกเป็น pure function รับ rows ที่ query มาแล้ว เพื่อทดสอบ logic การแยก
 * ยอดตาม taxScheme ได้โดยไม่ต้อง mock DB (ดู tests/lib/payroll-ytd.test.ts)
 */
export function computePayrollYtdFromRows(rows: PayrollYtdRow[]): PayrollYtdTotals {
  let income = 0
  let taxNormal = 0
  let taxOffSystemWht = 0
  let socialSecurity = 0

  for (const r of rows) {
    income +=
      r.baseSalary + r.positionAllowance + r.diligenceAllowance +
      r.backPay + r.commission + r.overtimePay + r.bonus
    socialSecurity += r.socialSecurity
    if (r.taxScheme === 'OFF_SYSTEM_WHT') {
      taxOffSystemWht += r.taxDeduction
    } else {
      taxNormal += r.taxDeduction
    }
  }

  return { income, taxNormal, taxOffSystemWht, socialSecurity }
}

/** ดึง Payroll ทุกแถวของ user คนนี้ ตั้งแต่เดือน 1 ถึง uptoMonth ของปี year
 * (inclusive ทั้งคู่) แล้วรวมยอดผ่าน computePayrollYtdFromRows — ไม่รวมแถวที่
 * soft-delete หรือ REJECTED (เดียวกับเงื่อนไขที่ใช้นับงวดเงินประกันใน
 * lib/payroll-security-deposit.ts) derive สดทุกครั้งจาก Payroll จริง ไม่ใช่
 * ตัวเลขสะสม mutable — เหตุผลเดียวกับ daysWorked/securityDepositInstallmentNo */
export async function computePayrollYtd(
  userId: string,
  year: number,
  uptoMonth: number,
): Promise<PayrollYtdTotals> {
  const rows = await prisma.payroll.findMany({
    where: {
      userId,
      year,
      month: { lte: uptoMonth },
      deletedAt: null,
      status: { not: 'REJECTED' },
    },
    select: {
      baseSalary: true,
      positionAllowance: true,
      diligenceAllowance: true,
      backPay: true,
      commission: true,
      overtimePay: true,
      bonus: true,
      taxDeduction: true,
      socialSecurity: true,
      taxScheme: true,
    },
  })
  return computePayrollYtdFromRows(rows)
}
