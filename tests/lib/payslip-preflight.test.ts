import { describe, it, expect } from 'vitest'
import {
  getPayslipBlockers,
  isPayslipSendReady,
  partitionPayslipBatch,
  type PayslipPreflightRow,
} from '@/lib/payslip-preflight'

const ready: PayslipPreflightRow = {
  hasPayroll: true,
  status: 'APPROVED',
  lineLinked: true,
}

describe('isPayslipSendReady / getPayslipBlockers', () => {
  it('a fully ready row has no blockers', () => {
    expect(getPayslipBlockers(ready)).toEqual([])
    expect(isPayslipSendReady(ready)).toBe(true)
  })

  it('not linked to LINE is blocked with NO_LINE', () => {
    const row = { ...ready, lineLinked: false }
    expect(getPayslipBlockers(row).map((b) => b.code)).toEqual(['NO_LINE'])
  })

  it('payroll not APPROVED is blocked with NOT_APPROVED', () => {
    const row = { ...ready, status: 'DRAFT' }
    expect(getPayslipBlockers(row).map((b) => b.code)).toEqual(['NOT_APPROVED'])
  })

  it('no payroll row at all (hasPayroll: false) is blocked with NO_PAYROLL — distinct from NOT_APPROVED, different action', () => {
    const row = { ...ready, hasPayroll: false, status: 'PENDING' }
    const blockers = getPayslipBlockers(row)
    expect(blockers.map((b) => b.code)).toEqual(['NO_PAYROLL'])
    expect(blockers[0].action).toBe('กดคำนวณเงินเดือนก่อน')
  })

  it('NO_PAYROLL and NOT_APPROVED never both fire — hasPayroll:false always wins', () => {
    const row = { ...ready, hasPayroll: false, status: 'DRAFT' }
    expect(getPayslipBlockers(row).map((b) => b.code)).toEqual(['NO_PAYROLL'])
  })

  it('a row can carry multiple blockers at once', () => {
    const row = { hasPayroll: true, status: 'DRAFT', lineLinked: false }
    const codes = getPayslipBlockers(row).map((b) => b.code)
    expect(codes).toEqual(['NOT_APPROVED', 'NO_LINE'])
    expect(isPayslipSendReady(row)).toBe(false)
  })

  it('every blocker carries a human action, not just a code', () => {
    for (const row of [
      { ...ready, lineLinked: false },
      { ...ready, status: 'DRAFT' },
      { ...ready, hasPayroll: false },
    ]) {
      const [blocker] = getPayslipBlockers(row)
      expect(blocker.label.length).toBeGreaterThan(0)
      expect(blocker.action.length).toBeGreaterThan(0)
    }
  })

  it('backlog: payslip password review — a missing or invalid nationalId is no longer a blocker at all (the PDF password no longer derives from it)', () => {
    // The old shape allowed a `nationalIdStatus` field; the type no longer
    // has it, but even passing it through (e.g. a stale client payload)
    // must never resurrect the old NO_NATIONAL_ID/INVALID_NATIONAL_ID codes.
    const rowWithStaleField = { ...ready, nationalIdStatus: 'MISSING' } as PayslipPreflightRow
    expect(getPayslipBlockers(rowWithStaleField)).toEqual([])
    expect(isPayslipSendReady(rowWithStaleField)).toBe(true)
  })

  it('lists exactly the 3 remaining blocker types — NO_NATIONAL_ID/INVALID_NATIONAL_ID are gone for good', () => {
    const allBlockers = getPayslipBlockers({ hasPayroll: false, status: 'DRAFT', lineLinked: false })
    // hasPayroll:false wins over NOT_APPROVED, so only NO_PAYROLL + NO_LINE show here —
    // this test is really about codes never including the removed ones.
    for (const b of allBlockers) {
      expect(['NO_PAYROLL', 'NOT_APPROVED', 'NO_LINE']).toContain(b.code)
    }
  })
})

describe('partitionPayslipBatch — the actual batch-send filter', () => {
  const withId = (userId: string, overrides: Partial<typeof ready & { payslipSentStatus?: string | null }> = {}) => ({
    userId,
    ...ready,
    ...overrides,
  })

  it('คนที่พร้อม (approved + LINE เชื่อมแล้ว) ต้องยังส่งได้ปกติ — ไม่ต้องมีเลขบัตรอีกต่อไป', () => {
    const rows = [withId('ready-1')]
    const { eligible, blocked } = partitionPayslipBatch(rows)
    expect(blocked).toEqual([])
    expect(eligible.map((r) => r.userId)).toEqual(['ready-1'])
  })

  it('คนที่ส่งสำเร็จแล้ว (SUCCESS) ไม่ใช่ eligible อีก แต่ก็ไม่ใช่ blocked', () => {
    const rows = [withId('done-1', { payslipSentStatus: 'SUCCESS' })]
    const { eligible, blocked, alreadySent } = partitionPayslipBatch(rows)
    expect(eligible).toEqual([])
    expect(blocked).toEqual([])
    expect(alreadySent.map((r) => r.userId)).toEqual(['done-1'])
  })

  it('batch ผสม — แยกแต่ละคนเข้ากลุ่มถูกต้องพร้อมกัน (ไม่มีการบล็อกด้วยเลขบัตรอีกแล้ว)', () => {
    const rows = [
      withId('ready-1'),
      withId('no-line', { lineLinked: false }),
      withId('not-approved', { status: 'DRAFT' }),
      withId('done-1', { payslipSentStatus: 'SUCCESS' }),
    ]
    const { eligible, blocked, alreadySent } = partitionPayslipBatch(rows)
    expect(eligible.map((r) => r.userId)).toEqual(['ready-1'])
    expect(blocked.map((r) => r.userId)).toEqual(['no-line', 'not-approved'])
    expect(alreadySent.map((r) => r.userId)).toEqual(['done-1'])
  })
})
