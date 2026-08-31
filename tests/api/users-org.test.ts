import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    department: { findUnique: vi.fn() },
    section: { findUnique: vi.fn() },
  },
}))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
  runNotify: (fn: () => Promise<unknown>) => fn().catch(() => undefined),
}))

vi.mock('@/lib/org-permissions', () => ({
  canManageOrg: vi.fn().mockReturnValue(true),
}))

vi.mock('@/lib/user-org', () => ({
  validateOrgAssignment: vi.fn().mockResolvedValue({ ok: true }),
  syncUserLegacyDepartment: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/notifications'
import { PATCH } from '@/app/api/users/[id]/org/route'

function baseAuditRow(overrides: Record<string, unknown> = {}) {
  return {
    email: 'emp9@co.com', phone: null, name: 'พนักงาน เก้า', nameEn: null,
    nickname: null, prefix: null, address: null, addressIdCard: null,
    birthDate: null, nationalId: null, lineId: null,
    role: 'EMPLOYEE', status: 'ACTIVE', startDate: null,
    department: 'แผนกเดิม', position: null, employeeType: null,
    managerId: null, teamLeaderId: null, baseSalary: null,
    socialSecurity: true, isCoworker: false, divisionId: 'div-old', sectionId: null,
    branchId: 'b1',
    ...overrides,
  }
}

function makePatch(id: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/users/${id}/org`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
const params = (id: string) => Promise.resolve({ id })

const hrSession = { user: { id: 'hr-1', role: 'HR', branchId: 'b1' } }

describe('PATCH /api/users/[id]/org — audit log', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.department.findUnique).mockResolvedValue({
      id: 'dept-2', name: 'แผนกใหม่', division: { id: 'div-2', name: 'ฝ่ายใหม่' },
    } as never)
    vi.mocked(prisma.user.update).mockResolvedValue({} as never)
  })

  it('records a division/department reassignment as a targetType User UPDATE audit log', async () => {
    const before = baseAuditRow({ divisionId: 'div-old', department: 'แผนกเดิม' })
    const after = baseAuditRow({ divisionId: 'div-2', department: 'แผนกใหม่' })
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(before as never) // initial fetch (also beforeAudit)
      .mockResolvedValueOnce(after as never)  // afterAudit

    const res = await PATCH(
      makePatch('emp-9', { divisionId: 'div-2', departmentId: 'dept-2' }),
      { params: params('emp-9') },
    )
    expect(res.status).toBe(200)

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'hr-1',
        targetId: 'emp-9',
        targetType: 'User',
        action: 'UPDATE',
        before: expect.objectContaining({ divisionId: 'div-old', department: 'แผนกเดิม' }),
        after: expect.objectContaining({ divisionId: 'div-2', department: 'แผนกใหม่' }),
      }),
    )
  })

  it('does not write an audit log when the reassignment is a no-op (same division/department)', async () => {
    const row = baseAuditRow({ divisionId: 'div-old', department: 'แผนกเดิม' })
    vi.mocked(prisma.department.findUnique).mockResolvedValue({
      id: 'dept-2', name: 'แผนกเดิม', division: { id: 'div-old', name: 'ฝ่ายเดิม' },
    } as never)
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(row as never)
      .mockResolvedValueOnce(row as never)

    await PATCH(makePatch('emp-9', { divisionId: 'div-old', departmentId: 'dept-2' }), { params: params('emp-9') })

    expect(createAuditLog).not.toHaveBeenCalled()
  })

  it('never leaks the raw nationalId even though it is fetched for the snapshot', async () => {
    const before = baseAuditRow({ nationalId: '1234567890123', divisionId: 'div-old' })
    const after = baseAuditRow({ nationalId: '1234567890123', divisionId: 'div-2' })
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(before as never)
      .mockResolvedValueOnce(after as never)

    await PATCH(makePatch('emp-9', { divisionId: 'div-2', departmentId: 'dept-2' }), { params: params('emp-9') })

    const call = vi.mocked(createAuditLog).mock.calls[0][0]
    expect(JSON.stringify(call)).not.toContain('1234567890123')
  })
})
