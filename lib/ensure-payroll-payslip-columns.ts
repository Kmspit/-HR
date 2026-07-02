import { addColumnIfMissing } from '@/lib/migrations/core'

let ensurePromise: Promise<void> | null = null

/** Idempotent — adds payslip LINE delivery columns if production DB is behind schema. */
export async function ensurePayrollPayslipColumns(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await addColumnIfMissing(
        'payrolls',
        'payslipSentAt',
        `ALTER TABLE payrolls ADD COLUMN payslipSentAt DATETIME`,
      )
      await addColumnIfMissing(
        'payrolls',
        'payslipSentVia',
        `ALTER TABLE payrolls ADD COLUMN payslipSentVia TEXT`,
      )
      await addColumnIfMissing(
        'payrolls',
        'payslipSentStatus',
        `ALTER TABLE payrolls ADD COLUMN payslipSentStatus TEXT`,
      )
      await addColumnIfMissing(
        'payrolls',
        'payslipSentError',
        `ALTER TABLE payrolls ADD COLUMN payslipSentError TEXT`,
      )
    })().catch((err) => {
      ensurePromise = null
      console.error('[ensurePayrollPayslipColumns]', err)
      throw err
    })
  }
  await ensurePromise
}
