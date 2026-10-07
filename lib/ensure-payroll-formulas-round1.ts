import { addColumnIfMissing } from '@/lib/migrations/core'

let ensurePromise: Promise<void> | null = null

/** Idempotent — payroll formulas round 1 (2026-10): users.monthlyTaxOverride
 *  (ภาษี ภงด.1 ต่อเดือนที่ HR กำหนดเองรายคน) + users.lastWorkingDate (วันทำงาน
 *  วันสุดท้าย ใช้ prorate/เลือกรอบคนลาออก). เดียวกับแนวทาง
 *  ensure-payroll-fields-batch-3.ts — เพิ่ม column ทันทีตอน request เข้า ไม่ต้อง
 *  รอ cron/postbuild ของ lib/ensure-db-schema.ts (ซึ่งอัปเดตคู่กันไว้แล้ว v900046) */
export async function ensurePayrollFormulasRound1(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await addColumnIfMissing('users', 'monthlyTaxOverride', `ALTER TABLE users ADD COLUMN monthlyTaxOverride REAL`)
      await addColumnIfMissing('users', 'lastWorkingDate', `ALTER TABLE users ADD COLUMN lastWorkingDate DATETIME`)
    })().catch((err) => {
      ensurePromise = null
      console.error('[ensurePayrollFormulasRound1]', err)
      throw err
    })
  }
  await ensurePromise
}
