import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/api-guard', () => ({
  requireAuth: vi.fn(),
  requireOrgScope: vi.fn(),
  isGuardResponse: (v: unknown) => v instanceof Response,
}))

vi.mock('@/lib/org-permissions', () => ({
  canManageOrg: vi.fn(),
}))

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  create: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn(), update: mocks.update },
    employmentAssignment: { findMany: vi.fn(), findFirst: vi.fn(), create: mocks.create },
    division: { findMany: vi.fn() },
    department: { findUnique: vi.fn(), findMany: vi.fn() },
    section: { findMany: vi.fn() },
    jobPosition: { findUnique: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => {
      if (typeof fn === 'function') {
        return fn({
          user: { update: mocks.update },
          employmentAssignment: { create: mocks.create },
        })
      }
      return Promise.resolve(fn)
    }),
  },
}))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

vi.mock('@/lib/user-org', () => ({
  validateOrgAssignment: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('@/lib/notifications', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth, requireOrgScope } from '@/lib/api-guard'
import { canManageOrg } from '@/lib/org-permissions'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/notifications'
import { GET, POST } from '@/app/api/users/[id]/employment-assignments/route'

function makeGet() {
  return new NextRequest('http://localhost/api/users/emp-9/employment-assignments')
}
function makePost(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/users/emp-9/employment-assignments', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}
const params = () => Promise.resolve({ id: 'emp-9' })

const hrSession = { user: { id: 'hr-1', role: 'HR', branchId: 'b1' } }
const managerSession = { user: { id: 'mgr-1', role: 'MANAGER', branchId: 'b1' } }

function auditRow(overrides: Record<string, unknown> = {}) {
  return {
    email: 'a@co.com', phone: null, name: 'ก ข', nameEn: null,
    nickname: null, prefix: null, address: null, addressIdCard: null,
    birthDate: null, nationalId: null, lineId: null,
    role: 'EMPLOYEE', status: 'ACTIVE', startDate: null,
    department: 'แผนกเดิม', position: 'ตำแหน่งเดิม', employeeType: 'permanent_employee',
    managerId: null, teamLeaderId: null, baseSalary: 30000,
    socialSecurity: true, isCoworker: false, divisionId: 'div-1', sectionId: null,
    employeeProfile: null,
    branchId: 'b1',
    ...overrides,
  }
}

function latestAssignment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'assign-1', userId: 'emp-9', effectiveFrom: new Date('2026-01-01'), changeType: 'HIRE',
    employmentType: 'FULL_TIME', divisionId: 'div-1', departmentId: 'dept-1', sectionId: null,
    jobPositionId: 'pos-1', branchId: 'b1', baseSalary: 30000,
    terminationType: null, terminationReason: null, rehireEligible: null,
    reason: null, note: null, createdById: 'hr-1', createdAt: new Date('2026-01-01'),
    ...overrides,
  }
}

describe('GET /api/users/[id]/employment-assignments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue(hrSession as never)
    vi.mocked(requireOrgScope).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.employmentAssignment.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.employmentAssignment.findFirst).mockResolvedValue(null as never)
    vi.mocked(prisma.division.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.department.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.section.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as never)
  })

  it('passes through a guard-denied response', async () => {
    vi.mocked(requireOrgScope).mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }) as never)
    const res = await GET(makeGet(), { params: params() })
    expect(res.status).toBe(403)
  })

  it('includes baseSalary for an HR_ADMIN viewer', async () => {
    vi.mocked(prisma.employmentAssignment.findMany).mockResolvedValue([{
      ...latestAssignment(), jobPosition: { name: 'ผู้จัดการ' },
    }] as never)
    const res = await GET(makeGet(), { params: params() })
    const data = await res.json()
    expect(data.assignments[0].baseSalary).toBe(30000)
  })

  it('omits baseSalary entirely for a non-HR_ADMIN viewer (not just masked)', async () => {
    vi.mocked(requireAuth).mockResolvedValue(managerSession as never)
    vi.mocked(requireOrgScope).mockResolvedValue(managerSession as never)
    vi.mocked(prisma.employmentAssignment.findMany).mockResolvedValue([{
      ...latestAssignment(), jobPosition: { name: 'ผู้จัดการ' },
    }] as never)
    const res = await GET(makeGet(), { params: params() })
    const raw = await res.text()
    expect(raw).not.toContain('30000')
    const data = JSON.parse(raw)
    expect('baseSalary' in data.assignments[0]).toBe(false)
  })

  it('marks currentAssignmentId using getCurrentAssignment (TERMINATION-aware), not just the latest row', async () => {
    const hireRow = { ...latestAssignment({ id: 'assign-1', effectiveFrom: new Date('2026-01-01'), changeType: 'HIRE' }), jobPosition: { name: 'พนักงาน' } }
    const terminationRow = { ...latestAssignment({ id: 'assign-2', effectiveFrom: new Date('2026-06-01'), changeType: 'TERMINATION' }), jobPosition: { name: 'พนักงาน' } }
    vi.mocked(prisma.employmentAssignment.findMany).mockResolvedValue([terminationRow, hireRow] as never)
    // getCurrentAssignment() internally calls findFirst — most recent as-of-now row, which is the termination one.
    vi.mocked(prisma.employmentAssignment.findFirst).mockResolvedValue(terminationRow as never)

    const res = await GET(makeGet(), { params: params() })
    const data = await res.json()
    // A TERMINATION row must never be reported as the "current" assignment.
    expect(data.currentAssignmentId).toBeNull()
  })

  it('resolves division/department/section/creator names via batched lookups, not raw ids', async () => {
    vi.mocked(prisma.employmentAssignment.findMany).mockResolvedValue([{
      ...latestAssignment({ divisionId: 'div-1', departmentId: 'dept-1', sectionId: 'sec-1', createdById: 'hr-1' }),
      jobPosition: { name: 'ผู้จัดการ' },
    }] as never)
    vi.mocked(prisma.division.findMany).mockResolvedValue([{ id: 'div-1', name: 'ฝ่ายกฎหมาย' }] as never)
    vi.mocked(prisma.department.findMany).mockResolvedValue([{ id: 'dept-1', name: 'แผนกคดี' }] as never)
    vi.mocked(prisma.section.findMany).mockResolvedValue([{ id: 'sec-1', name: 'ส่วนบังคับคดี' }] as never)
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'hr-1', name: 'HR คนหนึ่ง' }] as never)

    const res = await GET(makeGet(), { params: params() })
    const data = await res.json()
    expect(data.assignments[0].divisionName).toBe('ฝ่ายกฎหมาย')
    expect(data.assignments[0].departmentName).toBe('แผนกคดี')
    expect(data.assignments[0].sectionName).toBe('ส่วนบังคับคดี')
    expect(data.assignments[0].createdByName).toBe('HR คนหนึ่ง')
  })
})

const validPromotionBody = {
  changeType: 'PROMOTION', effectiveFrom: '2026-09-03',
  jobPositionId: 'pos-2', divisionId: 'div-1', departmentId: 'dept-1',
  employmentType: 'FULL_TIME', baseSalary: 35000,
}

describe('POST /api/users/[id]/employment-assignments — PROMOTION/TRANSFER/CONTRACT_RENEW', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue(hrSession as never)
    vi.mocked(canManageOrg).mockReturnValue(true)
    vi.mocked(prisma.user.findUnique).mockResolvedValue(auditRow() as never)
    vi.mocked(prisma.employmentAssignment.findFirst).mockResolvedValue(latestAssignment({ effectiveFrom: new Date('2026-01-01') }) as never)
    vi.mocked(prisma.department.findUnique).mockResolvedValue({ id: 'dept-1', name: 'แผนกใหม่' } as never)
    vi.mocked(prisma.jobPosition.findUnique).mockResolvedValue({ id: 'pos-2', name: 'ผู้จัดการอาวุโส', isActive: true } as never)
    mocks.create.mockResolvedValue({ id: 'new-assign-1' } as never)
  })

  it('403s a non-HR_ADMIN viewer and never writes', async () => {
    vi.mocked(canManageOrg).mockReturnValue(false)
    const res = await POST(makePost(validPromotionBody), { params: params() })
    expect(res.status).toBe(403)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('400s an invalid changeType', async () => {
    const res = await POST(makePost({ ...validPromotionBody, changeType: 'HIRE' }), { params: params() })
    expect(res.status).toBe(400)
  })

  it('blocks a future effectiveFrom', async () => {
    const res = await POST(makePost({ ...validPromotionBody, effectiveFrom: '2099-01-01' }), { params: params() })
    expect(res.status).toBe(400)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('blocks effectiveFrom on or before the latest existing assignment', async () => {
    const res = await POST(makePost({ ...validPromotionBody, effectiveFrom: '2026-01-01' }), { params: params() })
    expect(res.status).toBe(400)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('requires baseSalary (always HR_ADMIN-gated action, never conditionally hidden)', async () => {
    const { baseSalary: _drop, ...withoutSalary } = validPromotionBody
    void _drop
    const res = await POST(makePost(withoutSalary), { params: params() })
    expect(res.status).toBe(400)
  })

  it('creates the assignment and syncs User fields in the same transaction', async () => {
    const res = await POST(makePost(validPromotionBody), { params: params() })
    expect(res.status).toBe(201)
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'emp-9' },
        data: expect.objectContaining({ position: 'ผู้จัดการอาวุโส', department: 'แผนกใหม่', baseSalary: 35000 }),
      }),
    )
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ changeType: 'PROMOTION', baseSalary: 35000 }) }),
    )
  })

  it('writes an audit log reflecting the User-field diff', async () => {
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(auditRow({ position: 'ตำแหน่งเดิม', baseSalary: 30000 }) as never)
      .mockResolvedValueOnce(auditRow({ position: 'ผู้จัดการอาวุโส', baseSalary: 35000 }) as never)
    await POST(makePost(validPromotionBody), { params: params() })
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'hr-1', targetId: 'emp-9', targetType: 'User', action: 'UPDATE' }),
    )
  })
})

const validTerminationBody = {
  changeType: 'TERMINATION', effectiveFrom: '2026-09-03',
  terminationType: 'RESIGN', terminationReason: 'ย้ายไปทำงานอื่น', rehireEligible: true,
}

describe('POST /api/users/[id]/employment-assignments — TERMINATION', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue(hrSession as never)
    vi.mocked(canManageOrg).mockReturnValue(true)
    vi.mocked(prisma.user.findUnique).mockResolvedValue(auditRow() as never)
    vi.mocked(prisma.employmentAssignment.findFirst).mockResolvedValue(latestAssignment({ effectiveFrom: new Date('2026-01-01') }) as never)
    mocks.create.mockResolvedValue({ id: 'new-assign-1' } as never)
  })

  it('404s (400) when there is no existing assignment to carry forward', async () => {
    vi.mocked(prisma.employmentAssignment.findFirst).mockResolvedValue(null as never)
    const res = await POST(makePost(validTerminationBody), { params: params() })
    expect(res.status).toBe(400)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('requires terminationType and rehireEligible', async () => {
    const missingType = await POST(makePost({ ...validTerminationBody, terminationType: undefined }), { params: params() })
    expect(missingType.status).toBe(400)
    const missingRehire = await POST(makePost({ ...validTerminationBody, rehireEligible: undefined }), { params: params() })
    expect(missingRehire.status).toBe(400)
  })

  it('sets User.status to DISABLED (not a new TERMINATED enum value)', async () => {
    await POST(makePost(validTerminationBody), { params: params() })
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'emp-9' }, data: { status: 'DISABLED' } })
  })

  it('carries forward position/org/employmentType/salary from the latest assignment unchanged — does not ask for new values', async () => {
    vi.mocked(prisma.employmentAssignment.findFirst).mockResolvedValue(latestAssignment({
      effectiveFrom: new Date('2026-01-01'), jobPositionId: 'pos-9', divisionId: 'div-9', departmentId: 'dept-9',
      sectionId: 'sec-9', employmentType: 'CONTRACT', baseSalary: 42000,
    }) as never)
    await POST(makePost(validTerminationBody), { params: params() })
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          changeType: 'TERMINATION', jobPositionId: 'pos-9', divisionId: 'div-9', departmentId: 'dept-9',
          sectionId: 'sec-9', employmentType: 'CONTRACT', baseSalary: 42000,
          terminationType: 'RESIGN', rehireEligible: true,
        }),
      }),
    )
  })

  it('never touches position/department/baseSalary on the User row for a termination', async () => {
    await POST(makePost(validTerminationBody), { params: params() })
    const call = mocks.update.mock.calls[0][0] as { data: Record<string, unknown> }
    expect('position' in call.data).toBe(false)
    expect('baseSalary' in call.data).toBe(false)
  })
})
