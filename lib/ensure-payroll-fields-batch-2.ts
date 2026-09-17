import { prisma } from '@/lib/prisma'
import { addColumnIfMissing } from '@/lib/migrations/core'

let ensurePromise: Promise<void> | null = null

/** Idempotent — payroll fields batch 2 (2026-09): ค่าตำแหน่ง/เบี้ยขยัน/ตกเบิก/
 *  คอมมิชชั่น/กยศ./เงินประกัน/ค่าวิชาชีพ 40(6). เดียวกับแนวทาง
 *  ensure-payroll-payslip-columns.ts — เพิ่ม column/table ทันทีตอน request เข้า
 *  ไม่ต้องรอ cron/postbuild ของ lib/ensure-db-schema.ts (ซึ่งก็อัปเดตคู่กันไว้
 *  แล้วสำหรับรอบ deploy ปกติ — ดูฟังก์ชันนี้เป็น safety net เพิ่มสำหรับ route
 *  ที่แตะ field พวกนี้โดยตรง เช่นเดียวกับที่ payslip columns ทำไว้ก่อนหน้า) */
export async function ensurePayrollFieldsBatch2(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      // ── users: recurring config (ไม่เปลี่ยนบ่อย, snapshot ลง Payroll ทุกเดือน) ──
      await addColumnIfMissing('users', 'positionAllowance', `ALTER TABLE users ADD COLUMN positionAllowance REAL`)
      await addColumnIfMissing('users', 'diligenceAllowanceDefault', `ALTER TABLE users ADD COLUMN diligenceAllowanceDefault REAL`)
      await addColumnIfMissing('users', 'studentLoanDeduction', `ALTER TABLE users ADD COLUMN studentLoanDeduction REAL`)

      // ── payrolls: snapshot ของเดือนนั้น (ตัวเลขจริงที่ใช้คำนวณ/จ่าย) ──
      await addColumnIfMissing('payrolls', 'positionAllowance', `ALTER TABLE payrolls ADD COLUMN positionAllowance REAL NOT NULL DEFAULT 0`)
      await addColumnIfMissing('payrolls', 'diligenceAllowance', `ALTER TABLE payrolls ADD COLUMN diligenceAllowance REAL NOT NULL DEFAULT 0`)
      await addColumnIfMissing('payrolls', 'backPay', `ALTER TABLE payrolls ADD COLUMN backPay REAL NOT NULL DEFAULT 0`)
      await addColumnIfMissing('payrolls', 'commission', `ALTER TABLE payrolls ADD COLUMN commission REAL NOT NULL DEFAULT 0`)
      await addColumnIfMissing('payrolls', 'studentLoanDeduction', `ALTER TABLE payrolls ADD COLUMN studentLoanDeduction REAL NOT NULL DEFAULT 0`)
      await addColumnIfMissing('payrolls', 'securityDepositDeduction', `ALTER TABLE payrolls ADD COLUMN securityDepositDeduction REAL NOT NULL DEFAULT 0`)
      await addColumnIfMissing('payrolls', 'securityDepositInstallmentNo', `ALTER TABLE payrolls ADD COLUMN securityDepositInstallmentNo INTEGER`)
      await addColumnIfMissing('payrolls', 'professionalFee', `ALTER TABLE payrolls ADD COLUMN professionalFee REAL NOT NULL DEFAULT 0`)
      await addColumnIfMissing('payrolls', 'professionalFeeTax', `ALTER TABLE payrolls ADD COLUMN professionalFeeTax REAL NOT NULL DEFAULT 0`)
      // เดิมคำนวณแล้วบวกลบเข้า netSalary ทันทีโดยไม่เคย persist — ต้องเก็บแยก
      // ตั้งแต่ batch นี้เพราะ PATCH /api/payroll/[id] ต้อง recompute netSalary
      // ใหม่ (ตอนแก้ backPay/commission) โดยไม่รื้อคำนวณจาก attendance ใหม่ทั้งหมด
      await addColumnIfMissing('payrolls', 'earlyLeaveDeduction', `ALTER TABLE payrolls ADD COLUMN earlyLeaveDeduction REAL NOT NULL DEFAULT 0`)

      // ── ตารางใหม่ทั้งหมด ──
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS security_deposit_plans (
          id TEXT NOT NULL PRIMARY KEY,
          userId TEXT NOT NULL UNIQUE,
          totalAmount REAL NOT NULL,
          totalInstallments INTEGER NOT NULL DEFAULT 6,
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          startMonth INTEGER NOT NULL,
          startYear INTEGER NOT NULL,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS professional_fee_payments (
          id TEXT NOT NULL PRIMARY KEY,
          payrollId TEXT NOT NULL,
          hiringCompany TEXT NOT NULL,
          jobType TEXT NOT NULL,
          amount REAL NOT NULL,
          paidAt DATETIME NOT NULL,
          taxWithheld REAL NOT NULL,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS professional_fee_payments_payrollId_idx ON professional_fee_payments (payrollId)`,
      )

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS professional_fee_related_persons (
          id TEXT NOT NULL PRIMARY KEY,
          professionalFeePaymentId TEXT NOT NULL,
          name TEXT NOT NULL,
          role TEXT NOT NULL
        )
      `)
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS professional_fee_related_persons_professionalFeePaymentId_idx ON professional_fee_related_persons (professionalFeePaymentId)`,
      )
    })().catch((err) => {
      ensurePromise = null
      console.error('[ensurePayrollFieldsBatch2]', err)
      throw err
    })
  }
  await ensurePromise
}
