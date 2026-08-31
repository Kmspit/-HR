import { describe, it, expect, vi } from 'vitest'
import { checkPurgeGuard } from '@/scripts/purge-user.mjs'

function mockDb(counts: { payroll?: number; warning?: number; taxHistory?: number; auditLog?: number }) {
  return {
    payroll: { count: vi.fn().mockResolvedValue(counts.payroll ?? 0) },
    warning: { count: vi.fn().mockResolvedValue(counts.warning ?? 0) },
    taxHistory: { count: vi.fn().mockResolvedValue(counts.taxHistory ?? 0) },
    auditLog: { count: vi.fn().mockResolvedValue(counts.auditLog ?? 0) },
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
