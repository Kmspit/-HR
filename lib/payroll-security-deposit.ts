import { roundMoney } from '@/lib/payroll-late-deduction'

export type SecurityDepositPlanRow = {
  totalAmount: number
  totalInstallments: number
  status: string
}

export type SecurityDepositInstallmentResult = {
  amount: number
  installmentNo: number | null
  /** true เมื่องวดนี้เป็นงวดที่ทำให้แผนครบแล้ว (installmentNo === totalInstallments) */
  completesPlan: boolean
}

/**
 * คำนวณยอด/ลำดับงวดที่ต้องหักเดือนนี้ จาก "จำนวนงวดที่หักไปแล้วก่อนหน้าเดือนนี้"
 * (priorPaidInstallments) ซึ่งต้องนับสดจาก Payroll จริงทุกครั้งตอน generate
 * (deletedAt null, status ไม่ใช่ REJECTED, securityDepositDeduction > 0, เดือน/ปี
 * ก่อนหน้าเดือนนี้) — ไม่เก็บเป็น counter ที่ +1 เอง เพื่อไม่ให้หลุด sync ถ้ามี
 * regenerate เดือนเดิมซ้ำ/soft-delete แล้วกู้คืน ยอดต่องวด = totalAmount หาร
 * totalInstallments ปัดเศษลง งวดสุดท้ายรับส่วนต่างที่ปัดเศษไปทั้งหมด เพื่อให้
 * ยอดรวมตรงเป๊ะกับ totalAmount ไม่ขาดไม่เกิน
 */
export function computeSecurityDepositInstallment(
  plan: SecurityDepositPlanRow | null | undefined,
  priorPaidInstallments: number,
): SecurityDepositInstallmentResult {
  if (!plan || plan.status !== 'ACTIVE' || plan.totalInstallments <= 0) {
    return { amount: 0, installmentNo: null, completesPlan: false }
  }
  if (priorPaidInstallments >= plan.totalInstallments) {
    // ครบแล้วตั้งแต่ก่อนเดือนนี้ — หยุดหักอัตโนมัติ
    return { amount: 0, installmentNo: null, completesPlan: false }
  }

  const installmentNo = priorPaidInstallments + 1
  const perInstallment = Math.floor((plan.totalAmount / plan.totalInstallments) * 100) / 100
  const isLastInstallment = installmentNo === plan.totalInstallments

  const amount = isLastInstallment
    ? roundMoney(plan.totalAmount - perInstallment * (plan.totalInstallments - 1))
    : perInstallment

  return { amount, installmentNo, completesPlan: isLastInstallment }
}
