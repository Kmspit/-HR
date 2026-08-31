import { prisma } from '@/lib/prisma'
import { addColumnIfMissing } from '@/lib/migrations/core'

let ensurePromise: Promise<void> | null = null

/** Idempotent — adds payslip LINE delivery + soft-delete columns if production DB is
 *  behind schema. */
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
      await addColumnIfMissing(
        'payrolls',
        'payslipCloudinaryPublicId',
        `ALTER TABLE payrolls ADD COLUMN payslipCloudinaryPublicId TEXT`,
      )
      // Soft-delete — payslips must be retained per labor law (2+ years), never hard-deleted.
      await addColumnIfMissing(
        'payrolls',
        'deleted_at',
        `ALTER TABLE payrolls ADD COLUMN deleted_at DATETIME`,
      )
      await addColumnIfMissing(
        'payrolls',
        'deleted_by_id',
        `ALTER TABLE payrolls ADD COLUMN deleted_by_id TEXT`,
      )
      await addColumnIfMissing(
        'salary_slips',
        'deleted_at',
        `ALTER TABLE salary_slips ADD COLUMN deleted_at DATETIME`,
      )
      await addColumnIfMissing(
        'salary_slips',
        'deleted_by_id',
        `ALTER TABLE salary_slips ADD COLUMN deleted_by_id TEXT`,
      )
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS payrolls_deleted_at_idx ON payrolls (deleted_at)`,
      )
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS salary_slips_deleted_at_idx ON salary_slips (deleted_at)`,
      )
    })().catch((err) => {
      ensurePromise = null
      console.error('[ensurePayrollPayslipColumns]', err)
      throw err
    })
  }
  await ensurePromise
}
