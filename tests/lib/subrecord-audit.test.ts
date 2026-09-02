import { describe, it, expect } from 'vitest'
import {
  summarizeContactCreate, summarizeContactDelete, summarizeContactUpdate,
  summarizeDependentCreate, summarizeDependentDelete, summarizeDependentUpdate,
  summarizeBankAccountCreate, summarizeBankAccountDisable, summarizeBankAccountReactivate, summarizeBankAccountUpdate,
  type ContactAuditRow, type DependentAuditRow, type BankAccountAuditRow,
} from '@/lib/subrecord-audit'

function contact(overrides: Partial<ContactAuditRow> = {}): ContactAuditRow {
  return { name: 'สมชาย', relationship: 'พี่ชาย', phone: '0812345678', altPhone: null, address: null, isPrimary: false, ...overrides }
}

describe('EmergencyContact summarizers', () => {
  it('create — one readable line naming who and their relationship', () => {
    const event = summarizeContactCreate(contact())
    expect(event.subrecordEvent).toBe(true)
    expect(event.entityType).toBe('EmergencyContact')
    expect(event.lines).toEqual(['เพิ่มผู้ติดต่อฉุกเฉิน: สมชาย (พี่ชาย)'])
  })

  it('delete — one readable line', () => {
    const event = summarizeContactDelete(contact())
    expect(event.lines[0]).toContain('ลบผู้ติดต่อฉุกเฉิน: สมชาย')
  })

  it('update — returns null when nothing actually changed', () => {
    const row = contact()
    expect(summarizeContactUpdate(row, { ...row })).toBeNull()
  })

  it('update — one line per changed field', () => {
    const before = contact({ phone: '0800000000' })
    const after = contact({ phone: '0812345678', isPrimary: true })
    const event = summarizeContactUpdate(before, after)
    expect(event?.lines.some((l) => l.includes('0800000000 → 0812345678'))).toBe(true)
    expect(event?.lines.some((l) => l.includes('ไม่ใช่ → ใช่'))).toBe(true)
  })
})

function dependent(overrides: Partial<DependentAuditRow> = {}): DependentAuditRow {
  return { name: 'เด็ก', relationType: 'CHILD', birthDate: null, nationalIdLast4: null, isTaxAllowance: false, note: null, ...overrides }
}

describe('Dependent summarizers', () => {
  it('create — includes masked nationalId when present', () => {
    const event = summarizeDependentCreate(dependent({ nationalIdLast4: '1234' }))
    expect(event.lines[0]).toContain('เพิ่มผู้อยู่ในอุปการะ: เด็ก (บุตร)')
    expect(event.lines[0]).toContain('1234')
  })

  it('create — omits the nationalId clause entirely when absent', () => {
    const event = summarizeDependentCreate(dependent())
    expect(event.lines[0]).toBe('เพิ่มผู้อยู่ในอุปการะ: เด็ก (บุตร)')
  })

  it('update — returns null when nothing changed', () => {
    const row = dependent()
    expect(summarizeDependentUpdate(row, { ...row })).toBeNull()
  })

  it('update — skips nationalId entirely when nationalIdPlain is absent on both sides, even if last4 differs (should never happen, but must not false-positive)', () => {
    const before = dependent({ nationalIdLast4: '1111' })
    const after = dependent({ nationalIdLast4: '2222' })
    const event = summarizeDependentUpdate(before, after)
    expect(event).toBeNull()
  })

  it('update — reports a real nationalId change via fingerprint when plain values are supplied', () => {
    const before = dependent({ nationalIdLast4: '1111', nationalIdPlain: '1111111111111' })
    const after = dependent({ nationalIdLast4: '2222', nationalIdPlain: '2222222222222' })
    const event = summarizeDependentUpdate(before, after)
    expect(event?.lines.some((l) => l.startsWith('เลขบัตรประชาชน'))).toBe(true)
    expect(JSON.stringify(event)).not.toContain('1111111111111')
    expect(JSON.stringify(event)).not.toContain('2222222222222')
  })

  it('update — does NOT report a change when the fingerprint matches even though the object reference differs', () => {
    const before = dependent({ nationalIdLast4: '1234', nationalIdPlain: '1111111111234' })
    const after = dependent({ nationalIdLast4: '1234', nationalIdPlain: '1111111111234' })
    expect(summarizeDependentUpdate(before, after)).toBeNull()
  })

  it('delete — one readable line', () => {
    expect(summarizeDependentDelete(dependent()).lines[0]).toContain('ลบผู้อยู่ในอุปการะ: เด็ก')
  })
})

// THAI_BANKS uses ธปท numeric codes, not alphabetic ones — '014' is SCB
// (ไทยพาณิชย์), '006' is KTB (กรุงไทย). See lib/thai-banks.ts.
function bank(overrides: Partial<BankAccountAuditRow> = {}): BankAccountAuditRow {
  return { bankCode: '014', accountName: 'สมชาย ใจดี', accountNumberLast4: '4417', accountType: null, isPrimary: false, isActive: true, ...overrides }
}

describe('BankAccount summarizers', () => {
  it('create — readable line with bank name, account name, and masked number', () => {
    const event = summarizeBankAccountCreate(bank())
    expect(event.lines[0]).toContain('เพิ่มบัญชีธนาคาร')
    expect(event.lines[0]).toContain('ไทยพาณิชย์')
    expect(event.lines[0]).toContain('สมชาย ใจดี')
    expect(event.lines[0]).toContain('4417')
  })

  it('disable and reactivate produce distinct, correctly-labeled lines', () => {
    expect(summarizeBankAccountDisable(bank()).lines[0]).toContain('ปิดใช้งานบัญชีธนาคาร')
    expect(summarizeBankAccountReactivate(bank()).lines[0]).toContain('เปิดใช้งานบัญชีธนาคารอีกครั้ง')
  })

  it('update — returns null when nothing changed', () => {
    const row = bank()
    expect(summarizeBankAccountUpdate(row, { ...row })).toBeNull()
  })

  it('update — reports an accountNumber change via fingerprint, masked in the output', () => {
    const before = bank({ accountNumberLast4: '4417', accountNumberPlain: '1112224417' })
    const after = bank({ accountNumberLast4: '9999', accountNumberPlain: '1112229999' })
    const event = summarizeBankAccountUpdate(before, after)
    expect(event?.lines.some((l) => l.startsWith('เลขบัญชี'))).toBe(true)
    expect(JSON.stringify(event)).not.toContain('1112224417')
    expect(JSON.stringify(event)).not.toContain('1112229999')
  })

  it('update — never decrypt-dependent fields (bankCode/accountName/isPrimary) still diff correctly without any plain accountNumber', () => {
    const before = bank({ bankCode: '006' })
    const after = bank({ bankCode: '014' })
    const event = summarizeBankAccountUpdate(before, after)
    expect(event?.lines[0]).toContain('กรุงไทย')
    expect(event?.lines[0]).toContain('ไทยพาณิชย์')
  })
})
