import { describe, it, expect } from 'vitest'
import { snapshotProfileForAudit, summarizeProfileChanges } from '@/lib/profile-history'

const baseUser = {
  email: 'somchai@example.com',
  phone: '0812345678',
  name: 'สมชาย ใจดี',
  prefix: 'นาย',
  nickname: 'ชาย',
  address: '123 ถนนสุขุมวิท',
  birthDate: null,
  nationalId: '1234567890123' as string | null,
  lineId: null,
  profileImage: null,
}

describe('snapshotProfileForAudit — nationalId is never persisted as plaintext', () => {
  it('stores a masked display, not the raw digits', () => {
    const snap = snapshotProfileForAudit(baseUser)
    expect(JSON.stringify(snap)).not.toContain('1234567890123')
    expect(snap.nationalId).toEqual({ masked: 'x-xxxx-xxxxx-xx-3', fp: expect.any(String) })
  })

  it('handles a missing nationalId without throwing', () => {
    const snap = snapshotProfileForAudit({ ...baseUser, nationalId: null })
    expect(snap.nationalId).toEqual({ masked: 'ยังไม่ได้กรอก', fp: null })
  })
})

describe('summarizeProfileChanges — still detects a real nationalId edit after masking', () => {
  it('reports no change when nationalId is genuinely unchanged', () => {
    const before = JSON.stringify(snapshotProfileForAudit(baseUser))
    const after = JSON.stringify(snapshotProfileForAudit(baseUser))
    const changes = summarizeProfileChanges(before, after)
    expect(changes.some((c) => c.startsWith('เลขบัตรประชาชน'))).toBe(false)
  })

  it('reports a change when nationalId changes to a DIFFERENT value that masks identically (same last digit)', () => {
    const before = JSON.stringify(snapshotProfileForAudit({ ...baseUser, nationalId: '1234567890123' }))
    const after = JSON.stringify(snapshotProfileForAudit({ ...baseUser, nationalId: '9999999999993' }))
    // sanity: these really do mask the same way — that's the exact case the fingerprint exists for
    expect(snapshotProfileForAudit({ ...baseUser, nationalId: '1234567890123' }).nationalId.masked).toBe(
      snapshotProfileForAudit({ ...baseUser, nationalId: '9999999999993' }).nationalId.masked,
    )
    const changes = summarizeProfileChanges(before, after)
    expect(changes.some((c) => c.startsWith('เลขบัตรประชาชน'))).toBe(true)
  })

  it('the reported change line never contains the raw digits of either value', () => {
    const before = JSON.stringify(snapshotProfileForAudit({ ...baseUser, nationalId: '1234567890123' }))
    const after = JSON.stringify(snapshotProfileForAudit({ ...baseUser, nationalId: '9876543210999' }))
    const changes = summarizeProfileChanges(before, after)
    const line = changes.find((c) => c.startsWith('เลขบัตรประชาชน'))
    expect(line).toBeDefined()
    expect(line).not.toContain('1234567890123')
    expect(line).not.toContain('9876543210999')
  })

  it('reports missing → filled as a change, shown via labels not raw digits', () => {
    const before = JSON.stringify(snapshotProfileForAudit({ ...baseUser, nationalId: null }))
    const after = JSON.stringify(snapshotProfileForAudit({ ...baseUser, nationalId: '1234567890123' }))
    const changes = summarizeProfileChanges(before, after)
    const line = changes.find((c) => c.startsWith('เลขบัตรประชาชน'))
    expect(line).toBe('เลขบัตรประชาชน: ยังไม่ได้กรอก → x-xxxx-xxxxx-xx-3')
  })

  it('legacy rows (nationalId stored as a raw string before masking existed) never leak the raw value when displayed', () => {
    // Simulates an AuditLog row written before this change — not something this code
    // creates anymore, but old rows in the DB still look like this until backfilled.
    const legacyBefore = JSON.stringify({ ...snapshotProfileForAudit(baseUser), nationalId: '1234567890123' })
    const legacyAfter = JSON.stringify({ ...snapshotProfileForAudit(baseUser), nationalId: '9876543210999' })
    const changes = summarizeProfileChanges(legacyBefore, legacyAfter)
    const line = changes.find((c) => c.startsWith('เลขบัตรประชาชน'))
    expect(line).toBeDefined()
    expect(line).not.toContain('1234567890123')
    expect(line).not.toContain('9876543210999')
  })
})
