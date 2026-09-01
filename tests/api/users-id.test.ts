import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst:  vi.fn(),
      findMany:   vi.fn(),
      update:     vi.fn(),
    },
  },
}))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

vi.mock('@/lib/session-epoch', () => ({
  bumpSessionEpoch: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/notifications', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/notifications'
import { PATCH } from '@/app/api/users/[id]/route'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePatch(id: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const params = (id: string) => Promise.resolve({ id })

const teamLeaderSession = { user: { id: 'tl-1', role: 'TEAM_LEADER', branchId: 'b1' } }
const managerSession    = { user: { id: 'mgr-1', role: 'MANAGER', branchId: 'b1' } }
const hrSession         = { user: { id: 'hr-1', role: 'HR', branchId: 'b1' } }

describe('PATCH /api/users/[id] — editing another user requires canManageUserProfile, not just view-scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.user.update).mockResolvedValue({ id: 'report-1', baseSalary: 99999 } as never)
  })

  it('forbids TEAM_LEADER from changing a direct report\'s salary via direct API call, even though they can view that report\'s timeline', async () => {
    vi.mocked(auth).mockResolvedValue(teamLeaderSession as never)
    // TEAM_LEADER passes the org-hierarchy check (report-1 is their direct report) —
    // this is what let the bug through before: view-scope alone was treated as edit-scope.
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'report-1' }] as never)

    const res = await PATCH(makePatch('report-1', { baseSalary: 999999 }), { params: params('report-1') })
    expect(res.status).toBe(403)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('still allows MANAGER (who has canManageUserProfile) to edit their direct report', async () => {
    vi.mocked(auth).mockResolvedValue(managerSession as never)
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'report-1' }] as never)

    const res = await PATCH(makePatch('report-1', { position: 'Senior Dev' }), { params: params('report-1') })
    expect(res.status).toBe(200)
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'report-1' }, data: expect.objectContaining({ position: 'Senior Dev' }) }),
    )
  })

  it('forbids TEAM_LEADER from editing someone who is not even their direct report', async () => {
    vi.mocked(auth).mockResolvedValue(teamLeaderSession as never)
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as never) // no direct reports match

    const res = await PATCH(makePatch('someone-else', { position: 'x' }), { params: params('someone-else') })
    expect(res.status).toBe(403)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('still allows HR (company-wide) to edit any employee profile', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ branchId: 'b1', managerId: null, teamLeaderId: null } as never)

    const res = await PATCH(makePatch('emp-9', { position: 'Lead' }), { params: params('emp-9') })
    expect(res.status).toBe(200)
  })

  it('still allows a user to edit their own non-restricted fields', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'self-1', role: 'EMPLOYEE', branchId: 'b1' } } as never)

    const res = await PATCH(makePatch('self-1', { nickname: 'ใหม่' }), { params: params('self-1') })
    expect(res.status).toBe(200)
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'self-1' } }),
    )
  })
})

describe('PATCH /api/users/[id] — protected fields (nationalId, startDate, employeeId) never get silently cleared', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    // HR editing someone else needs the org-scope lookup to resolve.
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ branchId: 'b1', managerId: null, teamLeaderId: null } as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null) // no dup by default
    vi.mocked(prisma.user.update).mockResolvedValue({ id: 'emp-9' } as never)
  })

  function updateData() {
    return vi.mocked(prisma.user.update).mock.calls[0][0].data as Record<string, unknown>
  }

  describe('nationalId', () => {
    it('is left untouched when the key is absent from the body', async () => {
      const res = await PATCH(makePatch('emp-9', { position: 'Lead' }), { params: params('emp-9') })
      expect(res.status).toBe(200)
      expect(updateData()).not.toHaveProperty('nationalId')
    })

    it('is left untouched when sent as an empty string', async () => {
      const res = await PATCH(makePatch('emp-9', { nationalId: '' }), { params: params('emp-9') })
      expect(res.status).toBe(200)
      expect(updateData()).not.toHaveProperty('nationalId')
    })

    it('is left untouched when sent as null', async () => {
      const res = await PATCH(makePatch('emp-9', { nationalId: null }), { params: params('emp-9') })
      expect(res.status).toBe(200)
      expect(updateData()).not.toHaveProperty('nationalId')
    })

    it('is written when a valid 13-digit value is sent', async () => {
      const res = await PATCH(makePatch('emp-9', { nationalId: '1234567890123' }), { params: params('emp-9') })
      expect(res.status).toBe(200)
      expect(updateData().nationalId).toBe('1234567890123')
    })
  })

  describe('startDate', () => {
    it('is left untouched when the key is absent from the body', async () => {
      const res = await PATCH(makePatch('emp-9', { position: 'Lead' }), { params: params('emp-9') })
      expect(res.status).toBe(200)
      expect(updateData()).not.toHaveProperty('startDate')
    })

    it('is left untouched when sent as an empty string', async () => {
      const res = await PATCH(makePatch('emp-9', { startDate: '' }), { params: params('emp-9') })
      expect(res.status).toBe(200)
      expect(updateData()).not.toHaveProperty('startDate')
    })

    it('is left untouched when sent as null', async () => {
      const res = await PATCH(makePatch('emp-9', { startDate: null }), { params: params('emp-9') })
      expect(res.status).toBe(200)
      expect(updateData()).not.toHaveProperty('startDate')
    })

    it('is written when a valid date value is sent', async () => {
      const res = await PATCH(makePatch('emp-9', { startDate: '2024-01-15' }), { params: params('emp-9') })
      expect(res.status).toBe(200)
      expect(updateData().startDate).toEqual(new Date('2024-01-15'))
    })
  })

  describe('employeeId', () => {
    it('has no write path via this endpoint — sending it has no effect either way', async () => {
      const res = await PATCH(makePatch('emp-9', { employeeId: 'X999', position: 'Lead' }), { params: params('emp-9') })
      expect(res.status).toBe(200)
      expect(updateData()).not.toHaveProperty('employeeId')
    })
  })
})

describe('PATCH /api/users/[id] — admin-edit audit log (targetType User, action UPDATE)', () => {
  function baseAuditRow(overrides: Record<string, unknown> = {}) {
    return {
      email: 'emp9@co.com', phone: '0812345678', name: 'พนักงาน เก้า', nameEn: null,
      nickname: null, prefix: null, address: null, addressIdCard: null,
      birthDate: null, nationalId: '1111111111111', lineId: null,
      role: 'EMPLOYEE', status: 'ACTIVE', startDate: null,
      department: 'IT', position: 'Dev', employeeType: 'permanent_employee',
      managerId: null, teamLeaderId: null, baseSalary: 30000,
      socialSecurity: true, isCoworker: false, divisionId: 'div-1', sectionId: null,
      ...overrides,
    }
  }

  const scopeCheckRow = { branchId: 'b1', managerId: null, teamLeaderId: null }

  function mockAuditSequence(before: Record<string, unknown>, after: Record<string, unknown>) {
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(scopeCheckRow as never) // HR org-scope check
      .mockResolvedValueOnce(before as never)        // beforeAudit
      .mockResolvedValueOnce(after as never)          // afterAudit
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.user.update).mockResolvedValue({ id: 'emp-9' } as never)
  })

  it('records a baseSalary change as plain numbers — never masked', async () => {
    mockAuditSequence(baseAuditRow({ baseSalary: 30000 }), baseAuditRow({ baseSalary: 35000 }))

    const res = await PATCH(makePatch('emp-9', { baseSalary: 35000 }), { params: params('emp-9') })
    expect(res.status).toBe(200)

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'hr-1',
        targetId: 'emp-9',
        targetType: 'User',
        action: 'UPDATE',
        before: expect.objectContaining({ baseSalary: 30000 }),
        after: expect.objectContaining({ baseSalary: 35000 }),
      }),
    )
  })

  it('masks nationalId in the audit snapshot — the raw digits never appear anywhere in the payload', async () => {
    mockAuditSequence(
      baseAuditRow({ nationalId: '1111111111111' }),
      baseAuditRow({ nationalId: '2222222222222' }),
    )

    await PATCH(makePatch('emp-9', { nationalId: '2222222222222' }), { params: params('emp-9') })

    const call = vi.mocked(createAuditLog).mock.calls[0][0] as { before: unknown; after: unknown }
    const raw = JSON.stringify(call)
    expect(raw).not.toContain('1111111111111')
    expect(raw).not.toContain('2222222222222')
    expect((call.after as { nationalId: { masked: string; fp: string } }).nationalId.masked).toBeTruthy()
  })

  it('does not write an audit log when nothing actually changed', async () => {
    const row = baseAuditRow()
    mockAuditSequence(row, row)

    await PATCH(makePatch('emp-9', { position: row.position }), { params: params('emp-9') })

    expect(createAuditLog).not.toHaveBeenCalled()
  })

  it('records a role change', async () => {
    mockAuditSequence(baseAuditRow({ role: 'EMPLOYEE' }), baseAuditRow({ role: 'TEAM_LEADER' }))

    const res = await PATCH(makePatch('emp-9', { role: 'TEAM_LEADER' }), { params: params('emp-9') })
    expect(res.status).toBe(200)

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        before: expect.objectContaining({ role: 'EMPLOYEE' }),
        after: expect.objectContaining({ role: 'TEAM_LEADER' }),
      }),
    )
  })

  it('records a status change', async () => {
    mockAuditSequence(baseAuditRow({ status: 'ACTIVE' }), baseAuditRow({ status: 'DISABLED' }))

    const res = await PATCH(makePatch('emp-9', { status: 'DISABLED' }), { params: params('emp-9') })
    expect(res.status).toBe(200)

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        before: expect.objectContaining({ status: 'ACTIVE' }),
        after: expect.objectContaining({ status: 'DISABLED' }),
      }),
    )
  })

  it('records a managerId (org reporting line) change', async () => {
    mockAuditSequence(
      baseAuditRow({ managerId: null }),
      baseAuditRow({ managerId: 'mgr-2' }),
    )

    await PATCH(makePatch('emp-9', { managerId: 'mgr-2' }), { params: params('emp-9') })

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        before: expect.objectContaining({ managerId: null }),
        after: expect.objectContaining({ managerId: 'mgr-2' }),
      }),
    )
  })
})

describe('PATCH /api/users/[id] — baseSalary restricted to HR_ADMIN (Phase 1 step 0)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.user.update).mockResolvedValue({ id: 'report-1' } as never)
  })

  function updateData() {
    return vi.mocked(prisma.user.update).mock.calls[0][0].data as Record<string, unknown>
  }

  it('silently ignores baseSalary from MANAGER (no error) but logs the blocked attempt', async () => {
    vi.mocked(auth).mockResolvedValue(managerSession as never)
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'report-1' }] as never) // direct report, passes edit-org-scope
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never) // no beforeAudit row -> skip employee-audit block

    const res = await PATCH(
      makePatch('report-1', { baseSalary: 999999, position: 'Senior Dev' }),
      { params: params('report-1') },
    )

    expect(res.status).toBe(200)
    expect(updateData()).not.toHaveProperty('baseSalary')
    expect(updateData()).toMatchObject({ position: 'Senior Dev' })

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'mgr-1',
        targetId: 'report-1',
        targetType: 'User',
        action: 'UPDATE',
        after: expect.objectContaining({
          baseSalaryChangeBlocked: true,
          attemptedRole: 'MANAGER',
          attemptedValue: 999999,
        }),
      }),
    )
  })

  it('allows HR to change baseSalary for another employee, with no blocked-attempt audit log', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ branchId: 'b1', managerId: null, teamLeaderId: null } as never) // HR org-scope check
      .mockResolvedValueOnce(null as never) // no beforeAudit row -> skip employee-audit block

    const res = await PATCH(makePatch('emp-9', { baseSalary: 45000 }), { params: params('emp-9') })

    expect(res.status).toBe(200)
    expect(updateData()).toMatchObject({ baseSalary: 45000 })
    expect(createAuditLog).not.toHaveBeenCalled()
  })

  it('still blocks a self-edit of baseSalary with the pre-existing 403, before the HR_ADMIN gate ever runs', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)

    const res = await PATCH(makePatch('hr-1', { baseSalary: 50000 }), { params: params('hr-1') })

    expect(res.status).toBe(403)
    expect(prisma.user.update).not.toHaveBeenCalled()
    expect(createAuditLog).not.toHaveBeenCalled()
  })
})
