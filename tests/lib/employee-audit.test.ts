import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/notifications', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}))

import { createAuditLog } from '@/lib/notifications'
import {
  snapshotEmployeeForAudit,
  logEmployeeUpdateIfChanged,
  summarizeEmployeeChanges,
  collectReferencedIds,
  mapEmployeeAuditLogs,
  type EmployeeNameLookup,
} from '@/lib/employee-audit'

function row(overrides: Record<string, unknown> = {}) {
  return {
    email: 'a@co.com', phone: null, name: 'ก ข', nameEn: null,
    nickname: null, prefix: null, address: null, addressIdCard: null,
    birthDate: null, nationalId: '1234567890123', lineId: null,
    role: 'EMPLOYEE', status: 'ACTIVE', startDate: null,
    department: null, position: null, employeeType: null,
    managerId: null, teamLeaderId: null, baseSalary: 30000,
    socialSecurity: true, isCoworker: false, divisionId: null, sectionId: null,
    ...overrides,
  } as Parameters<typeof snapshotEmployeeForAudit>[0]
}

describe('snapshotEmployeeForAudit', () => {
  it('masks nationalId — never returns the raw digits', () => {
    const snap = snapshotEmployeeForAudit(row({ nationalId: '1234567890123' }))
    expect(JSON.stringify(snap)).not.toContain('1234567890123')
    expect(snap.nationalId.masked).toBeTruthy()
    expect(snap.nationalId.fp).toBeTruthy()
  })

  it('keeps baseSalary as a plain number', () => {
    const snap = snapshotEmployeeForAudit(row({ baseSalary: 42000 }))
    expect(snap.baseSalary).toBe(42000)
  })

  it('null nationalId masks to a non-crashing value', () => {
    const snap = snapshotEmployeeForAudit(row({ nationalId: null }))
    expect(() => JSON.stringify(snap)).not.toThrow()
  })

  it('covers every field the admin-edit endpoints can write', () => {
    const snap = snapshotEmployeeForAudit(row())
    const expectedKeys = [
      'email', 'phone', 'name', 'nameEn', 'nickname', 'prefix', 'address',
      'addressIdCard', 'birthDate', 'nationalId', 'lineId', 'role', 'status',
      'startDate', 'department', 'position', 'employeeType', 'managerId',
      'teamLeaderId', 'baseSalary', 'socialSecurity', 'isCoworker',
      'divisionId', 'sectionId',
    ]
    expect(Object.keys(snap).sort()).toEqual(expectedKeys.sort())
  })
})

describe('logEmployeeUpdateIfChanged', () => {
  beforeEach(() => vi.clearAllMocks())

  const audit = { actorId: 'hr-1', targetId: 'emp-1', ip: '127.0.0.1' }

  it('writes a targetType User / action UPDATE log when something changed', async () => {
    const before = snapshotEmployeeForAudit(row({ baseSalary: 30000 }))
    const after = snapshotEmployeeForAudit(row({ baseSalary: 35000 }))

    await logEmployeeUpdateIfChanged({ ...audit, before, after })

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'hr-1', targetId: 'emp-1', targetType: 'User', action: 'UPDATE',
        before, after, ip: '127.0.0.1',
      }),
    )
  })

  it('does nothing when before and after are identical', async () => {
    const snap = snapshotEmployeeForAudit(row())
    await logEmployeeUpdateIfChanged({ ...audit, before: snap, after: snap })
    expect(createAuditLog).not.toHaveBeenCalled()
  })

  it('detects a nationalId change via the fingerprint even if two different IDs mask the same', async () => {
    // Both end in the same last digit, so the masked display could look identical —
    // the fingerprint must still catch the real change.
    const before = snapshotEmployeeForAudit(row({ nationalId: '1111111111119' }))
    const after = snapshotEmployeeForAudit(row({ nationalId: '2222222222219' }))

    await logEmployeeUpdateIfChanged({ ...audit, before, after })
    expect(createAuditLog).toHaveBeenCalled()
  })
})

function emptyLookup(): EmployeeNameLookup {
  return { users: new Map(), divisions: new Map(), sections: new Map() }
}

describe('summarizeEmployeeChanges', () => {
  it('formats a baseSalary change in Thai currency', () => {
    const before = snapshotEmployeeForAudit(row({ baseSalary: 30000 }))
    const after = snapshotEmployeeForAudit(row({ baseSalary: 35000 }))
    const lines = summarizeEmployeeChanges(before, after, emptyLookup())
    expect(lines).toContainEqual(expect.stringContaining('฿30,000'))
    expect(lines).toContainEqual(expect.stringContaining('฿35,000'))
  })

  it('formats role/status using their Thai labels, not the raw enum', () => {
    const before = snapshotEmployeeForAudit(row({ role: 'EMPLOYEE', status: 'ACTIVE' }))
    const after = snapshotEmployeeForAudit(row({ role: 'TEAM_LEADER', status: 'DISABLED' }))
    const lines = summarizeEmployeeChanges(before, after, emptyLookup())
    const roleLine = lines.find((l) => l.startsWith('สิทธิ์การใช้งาน'))
    const statusLine = lines.find((l) => l.startsWith('สถานะบัญชี'))
    expect(roleLine).not.toContain('EMPLOYEE')
    expect(roleLine).not.toContain('TEAM_LEADER')
    expect(statusLine).not.toContain('ACTIVE')
    expect(statusLine).not.toContain('DISABLED')
  })

  it('resolves managerId to a person name via the lookup, never the raw cuid', () => {
    const before = snapshotEmployeeForAudit(row({ managerId: null }))
    const after = snapshotEmployeeForAudit(row({ managerId: 'mgr-cuid-123' }))
    const lookup: EmployeeNameLookup = {
      users: new Map([['mgr-cuid-123', 'สมชาย ใจดี']]),
      divisions: new Map(),
      sections: new Map(),
    }
    const lines = summarizeEmployeeChanges(before, after, lookup)
    const line = lines.find((l) => l.startsWith('ผู้จัดการ'))
    expect(line).toContain('สมชาย ใจดี')
    expect(line).not.toContain('mgr-cuid-123')
  })

  it('falls back to "(ไม่พบข้อมูล)" when the referenced manager no longer resolves (e.g. deleted)', () => {
    const before = snapshotEmployeeForAudit(row({ managerId: null }))
    const after = snapshotEmployeeForAudit(row({ managerId: 'mgr-deleted-id' }))
    const lines = summarizeEmployeeChanges(before, after, emptyLookup())
    const line = lines.find((l) => l.startsWith('ผู้จัดการ'))
    expect(line).toContain('(ไม่พบข้อมูล)')
    expect(line).not.toContain('mgr-deleted-id')
  })

  it('never includes the raw nationalId even when it changed', () => {
    const before = snapshotEmployeeForAudit(row({ nationalId: '1111111111111' }))
    const after = snapshotEmployeeForAudit(row({ nationalId: '2222222222222' }))
    const lines = summarizeEmployeeChanges(before, after, emptyLookup())
    const raw = lines.join('\n')
    expect(raw).not.toContain('1111111111111')
    expect(raw).not.toContain('2222222222222')
    expect(lines.some((l) => l.startsWith('เลขบัตรประชาชน'))).toBe(true)
  })

  it('returns an empty array when nothing changed', () => {
    const snap = snapshotEmployeeForAudit(row())
    expect(summarizeEmployeeChanges(snap, snap, emptyLookup())).toEqual([])
  })
})

describe('collectReferencedIds', () => {
  it('collects manager/teamLeader ids into userIds, and division/section ids separately', () => {
    const snaps = [
      snapshotEmployeeForAudit(row({ managerId: 'mgr-1', teamLeaderId: 'tl-1', divisionId: 'div-1', sectionId: 'sec-1' })),
      snapshotEmployeeForAudit(row({ managerId: 'mgr-2', teamLeaderId: null, divisionId: null, sectionId: null })),
    ]
    const result = collectReferencedIds(snaps)
    expect(result.userIds.sort()).toEqual(['mgr-1', 'mgr-2', 'tl-1'].sort())
    expect(result.divisionIds).toEqual(['div-1'])
    expect(result.sectionIds).toEqual(['sec-1'])
  })

  it('returns empty arrays when nothing references anyone', () => {
    const snaps = [snapshotEmployeeForAudit(row())]
    const result = collectReferencedIds(snaps)
    expect(result).toEqual({ userIds: [], divisionIds: [], sectionIds: [] })
  })
})

describe('mapEmployeeAuditLogs', () => {
  it('maps raw AuditLog rows into display items with actor name', () => {
    const before = snapshotEmployeeForAudit(row({ position: 'Junior' }))
    const after = snapshotEmployeeForAudit(row({ position: 'Senior' }))
    const logs = [{
      id: 'log-1',
      createdAt: new Date('2026-08-31T09:00:00Z'),
      before: JSON.stringify(before),
      after: JSON.stringify(after),
      actor: { name: 'HR คนหนึ่ง' },
    }]
    const items = mapEmployeeAuditLogs(logs, emptyLookup())
    expect(items).toHaveLength(1)
    expect(items[0].actorName).toBe('HR คนหนึ่ง')
    expect(items[0].changes.some((c) => c.includes('Junior') && c.includes('Senior'))).toBe(true)
  })

  it('falls back to "ไม่ทราบ" when the actor is missing', () => {
    const snap = snapshotEmployeeForAudit(row({ position: 'A' }))
    const snap2 = snapshotEmployeeForAudit(row({ position: 'B' }))
    const logs = [{
      id: 'log-1', createdAt: new Date(), before: JSON.stringify(snap), after: JSON.stringify(snap2), actor: null,
    }]
    const items = mapEmployeeAuditLogs(logs, emptyLookup())
    expect(items[0].actorName).toBe('ไม่ทราบ')
  })

  it('drops rows where nothing recognizable changed (empty diff)', () => {
    const snap = snapshotEmployeeForAudit(row())
    const logs = [{
      id: 'log-1', createdAt: new Date(), before: JSON.stringify(snap), after: JSON.stringify(snap), actor: { name: 'X' },
    }]
    expect(mapEmployeeAuditLogs(logs, emptyLookup())).toEqual([])
  })

  it('drops unparsable/legacy rows without throwing', () => {
    const logs = [{ id: 'log-1', createdAt: new Date(), before: 'not json', after: 'also not json', actor: { name: 'X' } }]
    expect(() => mapEmployeeAuditLogs(logs, emptyLookup())).not.toThrow()
    expect(mapEmployeeAuditLogs(logs, emptyLookup())).toEqual([])
  })
})
