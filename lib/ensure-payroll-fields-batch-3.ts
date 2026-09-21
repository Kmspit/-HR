import { addColumnIfMissing } from '@/lib/migrations/core'

let ensurePromise: Promise<void> | null = null

/** Idempotent — payroll fields batch 3 (2026-09): taxScheme (แกนวิธีคิด
 *  ภาษี/SS อิสระจาก payType) + ค่าล่วงเวลา (OT) + โบนัส. เดียวกับแนวทาง
 *  ensure-payroll-fields-batch-2.ts — เพิ่ม column ทันทีตอน request เข้า
 *  ไม่ต้องรอ cron/postbuild ของ lib/ensure-db-schema.ts (ซึ่งก็อัปเดตคู่กันไว้
 *  แล้วสำหรับรอบ deploy ปกติ). */
export async function ensurePayrollFieldsBatch3(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      // users.taxScheme — enum จริง (ไม่เหมือน payrolls.taxScheme ที่เป็น
      // snapshot string) NOT NULL DEFAULT 'NORMAL' เพื่อให้พนักงานเดิมทุกคน
      // ตกเป็น NORMAL (สูตรเดิม) โดยอัตโนมัติ ไม่ต้อง backfill
      await addColumnIfMissing('users', 'taxScheme', `ALTER TABLE users ADD COLUMN taxScheme TEXT NOT NULL DEFAULT 'NORMAL'`)

      // ── payrolls: snapshot ของเดือนนั้น ──
      await addColumnIfMissing('payrolls', 'taxScheme', `ALTER TABLE payrolls ADD COLUMN taxScheme TEXT`)
      await addColumnIfMissing('payrolls', 'overtimePay', `ALTER TABLE payrolls ADD COLUMN overtimePay REAL NOT NULL DEFAULT 0`)
      await addColumnIfMissing('payrolls', 'bonus', `ALTER TABLE payrolls ADD COLUMN bonus REAL NOT NULL DEFAULT 0`)
    })().catch((err) => {
      ensurePromise = null
      console.error('[ensurePayrollFieldsBatch3]', err)
      throw err
    })
  }
  await ensurePromise
}
