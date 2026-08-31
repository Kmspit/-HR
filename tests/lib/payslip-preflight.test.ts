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
  nationalIdStatus: 'MASKED',
}

describe('isPayslipSendReady / getPayslipBlockers', () => {
  it('a fully ready row has no blockers', () => {
    expect(getPayslipBlockers(ready)).toEqual([])
    expect(isPayslipSendReady(ready)).toBe(true)
  })

  it('missing nationalId (MISSING) is blocked with NO_NATIONAL_ID, never INVALID', () => {
    const row = { ...ready, nationalIdStatus: 'MISSING' as const }
    const blockers = getPayslipBlockers(row)
    expect(blockers.map((b) => b.code)).toEqual(['NO_NATIONAL_ID'])
    expect(isPayslipSendReady(row)).toBe(false)
  })

  it('wrong-length nationalId (INVALID, e.g. 15 digits) is blocked with INVALID_NATIONAL_ID', () => {
    const row = { ...ready, nationalIdStatus: 'INVALID' as const }
    const blockers = getPayslipBlockers(row)
    expect(blockers.map((b) => b.code)).toEqual(['INVALID_NATIONAL_ID'])
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
    const row = { hasPayroll: true, status: 'DRAFT', lineLinked: false, nationalIdStatus: 'MISSING' as const }
    const codes = getPayslipBlockers(row).map((b) => b.code)
    expect(codes).toEqual(['NOT_APPROVED', 'NO_LINE', 'NO_NATIONAL_ID'])
    expect(isPayslipSendReady(row)).toBe(false)
  })

  it('every blocker carries a human action, not just a code', () => {
    for (const row of [
      { ...ready, nationalIdStatus: 'MISSING' as const },
      { ...ready, nationalIdStatus: 'INVALID' as const },
      { ...ready, lineLinked: false },
      { ...ready, status: 'DRAFT' },
    ]) {
      const [blocker] = getPayslipBlockers(row)
      expect(blocker.label.length).toBeGreaterThan(0)
      expect(blocker.action.length).toBeGreaterThan(0)
    }
  })
})

describe('partitionPayslipBatch — the actual batch-send filter', () => {
  const withId = (userId: string, overrides: Partial<typeof ready & { payslipSentStatus?: string | null }> = {}) => ({
    userId,
    ...ready,
    ...overrides,
  })

  it('คนไม่มีเลขบัตร ต้องถูกตัดออกจาก batch (blocked, ไม่ใช่ eligible)', () => {
    const rows = [withId('no-id', { nationalIdStatus: 'MISSING' })]
    const { eligible, blocked } = partitionPayslipBatch(rows)
    expect(eligible).toEqual([])
    expect(blocked.map((r) => r.userId)).toEqual(['no-id'])
  })

  it('คนเลขบัตรไม่ใช่ 13 หลัก (INVALID) ต้องถูกตัดออกจาก batch', () => {
    const rows = [withId('bad-id', { nationalIdStatus: 'INVALID' })]
    const { eligible, blocked } = partitionPayslipBatch(rows)
    expect(eligible).toEqual([])
    expect(blocked.map((r) => r.userId)).toEqual(['bad-id'])
  })

  it('คนที่พร้อม (approved + LINE เชื่อมแล้ว + เลขบัตรครบ 13 หลัก) ต้องยังส่งได้ปกติ', () => {
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

  it('batch ผสม — แยกแต่ละคนเข้ากลุ่มถูกต้องพร้อมกัน', () => {
    const rows = [
      withId('ready-1'),
      withId('no-id', { nationalIdStatus: 'MISSING' }),
      withId('bad-id', { nationalIdStatus: 'INVALID' }),
      withId('no-line', { lineLinked: false }),
      withId('not-approved', { status: 'DRAFT' }),
      withId('done-1', { payslipSentStatus: 'SUCCESS' }),
    ]
    const { eligible, blocked, alreadySent } = partitionPayslipBatch(rows)
    expect(eligible.map((r) => r.userId)).toEqual(['ready-1'])
    expect(blocked.map((r) => r.userId)).toEqual(['no-id', 'bad-id', 'no-line', 'not-approved'])
    expect(alreadySent.map((r) => r.userId)).toEqual(['done-1'])
  })
})
