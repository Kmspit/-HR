import { describe, it, expect, vi } from 'vitest'
import { checkPurgeGuard } from '@/scripts/purge-user.mjs'

type Counts = {
  payroll?: number; warning?: number; taxHistory?: number; auditLog?: number
  billingInvoice?: number; billingPayment?: number; billingReceipt?: number
  caseCourt?: number; caseTimeline?: number; caseDebtorActivity?: number
  debtorContact?: number; promiseToPay?: number
  recoveryPaymentCreated?: number; recoveryPaymentCollected?: number
  automationRule?: number; caseTemplates?: number
}

// recovery_payments is checked twice (createdById, collectorId) via the same
// model — a single mock fn can't return two different counts by call order
// safely, so it inspects the `where` clause to decide which count to return.
function mockDb(counts: Counts = {}) {
  return {
    payroll: { count: vi.fn().mockResolvedValue(counts.payroll ?? 0) },
    warning: { count: vi.fn().mockResolvedValue(counts.warning ?? 0) },
    taxHistory: { count: vi.fn().mockResolvedValue(counts.taxHistory ?? 0) },
    auditLog: { count: vi.fn().mockResolvedValue(counts.auditLog ?? 0) },
    billingInvoice: { count: vi.fn().mockResolvedValue(counts.billingInvoice ?? 0) },
    billingPayment: { count: vi.fn().mockResolvedValue(counts.billingPayment ?? 0) },
    billingReceipt: { count: vi.fn().mockResolvedValue(counts.billingReceipt ?? 0) },
    caseCourt: { count: vi.fn().mockResolvedValue(counts.caseCourt ?? 0) },
    caseTimeline: { count: vi.fn().mockResolvedValue(counts.caseTimeline ?? 0) },
    caseDebtorActivity: { count: vi.fn().mockResolvedValue(counts.caseDebtorActivity ?? 0) },
    debtorContact: { count: vi.fn().mockResolvedValue(counts.debtorContact ?? 0) },
    promiseToPay: { count: vi.fn().mockResolvedValue(counts.promiseToPay ?? 0) },
    recoveryPayment: {
      count: vi.fn((args: { where: Record<string, unknown> }) =>
        Promise.resolve(
          'collectorId' in args.where
            ? counts.recoveryPaymentCollected ?? 0
            : counts.recoveryPaymentCreated ?? 0,
        ),
      ),
    },
    automationRule: { count: vi.fn().mockResolvedValue(counts.automationRule ?? 0) },
    $queryRawUnsafe: vi.fn().mockResolvedValue([{ cnt: counts.caseTemplates ?? 0 }]),
  }
}

describe('checkPurgeGuard', () => {
  it('returns no blockers for a clean test account', async () => {
    const db = mockDb({})
    const result = await checkPurgeGuard(db, 'user-1')
    expect(result).toEqual([])
  })

  it('blocks on payroll history', async () => {
    const db = mockDb({ payroll: 3 })
    const result = await checkPurgeGuard(db, 'user-1')
    expect(result).toEqual([{ label: 'payroll', count: 3 }])
    expect(db.payroll.count).toHaveBeenCalledWith({ where: { userId: 'user-1' } })
  })

  it('blocks on disciplinary warnings', async () => {
    const db = mockDb({ warning: 2 })
    const result = await checkPurgeGuard(db, 'user-1')
    expect(result).toEqual([{ label: 'warnings (เอกสารวินัย)', count: 2 }])
  })

  it('blocks on tax history', async () => {
    const db = mockDb({ taxHistory: 1 })
    const result = await checkPurgeGuard(db, 'user-1')
    expect(result).toEqual([{ label: 'tax_histories (เอกสารภาษี)', count: 1 }])
  })

  it('blocks on audit logs where the user is the actor', async () => {
    const db = mockDb({ auditLog: 5 })
    const result = await checkPurgeGuard(db, 'user-1')
    expect(result).toEqual([{ label: 'audit_logs ที่เป็น actor', count: 5 }])
  })

  it('reports every blocking condition at once, each with its own count', async () => {
    const db = mockDb({ payroll: 1, warning: 2, taxHistory: 3, auditLog: 4 })
    const result = await checkPurgeGuard(db, 'user-1')
    expect(result).toEqual([
      { label: 'payroll', count: 1 },
      { label: 'warnings (เอกสารวินัย)', count: 2 },
      { label: 'tax_histories (เอกสารภาษี)', count: 3 },
      { label: 'audit_logs ที่เป็น actor', count: 4 },
    ])
  })
})

describe('checkPurgeGuard — 2026-09-09 wipe review: 12 required-FK tables + case_templates', () => {
  it('blocks on billing_invoices created by this user', async () => {
    const db = mockDb({ billingInvoice: 2 })
    const result = await checkPurgeGuard(db, 'user-1')
    expect(result).toEqual([{ label: 'billing_invoices (ผู้สร้าง)', count: 2 }])
    expect(db.billingInvoice.count).toHaveBeenCalledWith({ where: { createdById: 'user-1' } })
  })

  it('blocks on billing_payments created by this user', async () => {
    const db = mockDb({ billingPayment: 1 })
    const result = await checkPurgeGuard(db, 'user-1')
    expect(result).toEqual([{ label: 'billing_payments (ผู้สร้าง)', count: 1 }])
  })

  it('blocks on billing_receipts created by this user', async () => {
    const db = mockDb({ billingReceipt: 1 })
    const result = await checkPurgeGuard(db, 'user-1')
    expect(result).toEqual([{ label: 'billing_receipts (ผู้สร้าง)', count: 1 }])
  })

  it('blocks on case_courts created by this user', async () => {
    const db = mockDb({ caseCourt: 1 })
    const result = await checkPurgeGuard(db, 'user-1')
    expect(result).toEqual([{ label: 'case_courts (ผู้สร้าง)', count: 1 }])
  })

  it('blocks on case_timelines where this user is the actor', async () => {
    const db = mockDb({ caseTimeline: 3 })
    const result = await checkPurgeGuard(db, 'user-1')
    expect(result).toEqual([{ label: 'case_timelines (ผู้กระทำ)', count: 3 }])
    expect(db.caseTimeline.count).toHaveBeenCalledWith({ where: { userId: 'user-1' } })
  })

  it('blocks on case_debtor_activities where this user is the actor', async () => {
    const db = mockDb({ caseDebtorActivity: 1 })
    const result = await checkPurgeGuard(db, 'user-1')
    expect(result).toEqual([{ label: 'case_debtor_activities (ผู้กระทำ)', count: 1 }])
  })

  it('blocks on debtor_contacts performed by this user', async () => {
    const db = mockDb({ debtorContact: 4 })
    const result = await checkPurgeGuard(db, 'user-1')
    expect(result).toEqual([{ label: 'debtor_contacts (ผู้ติดต่อ)', count: 4 }])
  })

  it('blocks on promises_to_pay created by this user', async () => {
    const db = mockDb({ promiseToPay: 1 })
    const result = await checkPurgeGuard(db, 'user-1')
    expect(result).toEqual([{ label: 'promises_to_pay (ผู้สร้าง)', count: 1 }])
  })

  it('blocks on recovery_payments created by this user', async () => {
    const db = mockDb({ recoveryPaymentCreated: 2 })
    const result = await checkPurgeGuard(db, 'user-1')
    expect(result).toEqual([{ label: 'recovery_payments (ผู้สร้าง)', count: 2 }])
  })

  it('blocks on recovery_payments collected by this user (distinct from created)', async () => {
    const db = mockDb({ recoveryPaymentCollected: 5 })
    const result = await checkPurgeGuard(db, 'user-1')
    expect(result).toEqual([{ label: 'recovery_payments (ผู้เก็บเงิน)', count: 5 }])
  })

  it('reports both recovery_payments blockers at once when both apply', async () => {
    const db = mockDb({ recoveryPaymentCreated: 1, recoveryPaymentCollected: 1 })
    const result = await checkPurgeGuard(db, 'user-1')
    expect(result).toEqual([
      { label: 'recovery_payments (ผู้สร้าง)', count: 1 },
      { label: 'recovery_payments (ผู้เก็บเงิน)', count: 1 },
    ])
  })

  it('blocks on automation_rules created by this user', async () => {
    const db = mockDb({ automationRule: 1 })
    const result = await checkPurgeGuard(db, 'user-1')
    expect(result).toEqual([{ label: 'automation_rules (ผู้สร้าง)', count: 1 }])
  })

  it('blocks on case_templates via raw SQL — the table has no Prisma model', async () => {
    const db = mockDb({ caseTemplates: 1 })
    const result = await checkPurgeGuard(db, 'user-1')
    expect(result).toEqual([{ label: 'case_templates (ผู้สร้าง, ไม่มี Prisma model)', count: 1 }])
    expect(db.$queryRawUnsafe).toHaveBeenCalledWith(
      'SELECT COUNT(*) as cnt FROM case_templates WHERE created_by_id = ?',
      'user-1',
    )
  })

  it('a genuinely clean account still reports zero blockers across all 16 checks', async () => {
    const db = mockDb({})
    const result = await checkPurgeGuard(db, 'user-1')
    expect(result).toEqual([])
  })
})
