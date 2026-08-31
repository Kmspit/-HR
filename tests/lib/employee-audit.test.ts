import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/notifications', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}))

import { createAuditLog } from '@/lib/notifications'
import { snapshotEmployeeForAudit, logEmployeeUpdateIfChanged } from '@/lib/employee-audit'

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
