import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => {
  const user = { findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() }
  const employmentAssignment = { create: vi.fn().mockResolvedValue({ id: 'ea-1' }) }
  const department = { findUnique: vi.fn() }
  const section = { findUnique: vi.fn() }
  const jobPosition = { findUnique: vi.fn(), upsert: vi.fn() }
  return {
    prisma: {
      user,
      employmentAssignment,
      department,
      section,
      jobPosition,
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({ user, employmentAssignment })),
    },
  }
})

const createNotification = vi.fn().mockResolvedValue(undefined)
const sendLineNotify = vi.fn().mockResolvedValue(true)
const createAuditLog = vi.fn().mockResolvedValue({ id: 'audit-1' })
vi.mock('@/lib/notifications', () => ({
  createNotification: (...a: unknown[]) => createNotification(...a),
  sendLineNotify: (...a: unknown[]) => sendLineNotify(...a),
  createAuditLog: (...a: unknown[]) => createAuditLog(...a),
}))

vi.mock('@/lib/access-control', () => ({ canApproveAccounts: vi.fn().mockReturnValue(true) }))

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Map([['x-forwarded-for', '1.2.3.4']])),
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canApproveAccounts } from '@/lib/access-control'
import { POST } from '@/app/api/users/[id]/approve/route'

const hrSession = { user: { id: 'hr-1', name: 'HR Officer', role: 'HR', branchId: 'branch-1' } }
const managerHrSessionNoSalary = { user: { id: 'mgrhr-1', name: 'Manager Without Salary Rights', role: 'MANAGER', branchId: 'branch-1' } }
const params = Promise.resolve({ id: 'pending-1' })

function makeReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/users/pending-1/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const AUDIT_ROW_DEFAULTS = {
  email: 'newhire@x.com', phone: '0812345678', name: 'New Hire', nameEn: null,
  nickname: null, prefix: null, address: null, addressIdCard: null,
  birthDate: null, nationalId: null, lineId: null,
  role: 'EMPLOYEE', managerId: null, teamLeaderId: null,
  socialSecurity: true, isCoworker: false,
}

const pendingUser = {
  id: 'pending-1', status: 'PENDING', branchId: 'branch-1',
  ...AUDIT_ROW_DEFAULTS,
  startDate: null, department: null, position: null, employeeType: null,
  baseSalary: null, divisionId: null, departmentId: null, sectionId: null,
}

const activeAfterApproval = {
  ...pendingUser,
  status: 'ACTIVE',
  startDate: new Date('2026-09-01'), department: 'แผนกไอที', position: 'โปรแกรมเมอร์',
  employeeType: 'permanent_employee', baseSalary: 25000,
  divisionId: 'div-1', departmentId: 'dept-1', sectionId: null,
}

const mockDepartment = {
  id: 'dept-1', name: 'แผนกไอที', divisionId: 'div-1', branchId: 'branch-1', isActive: true,
  division: { name: 'ฝ่ายสนับสนุน' },
}

const mockJobPosition = { id: 'pos-1', name: 'โปรแกรมเมอร์', isActive: true }

const validApproveBody = {
  action: 'APPROVE',
  jobPositionId: 'pos-1',
  divisionId: 'div-1',
  departmentId: 'dept-1',
  employmentType: 'FULL_TIME',
  startDate: '2026-09-01',
  baseSalary: 25000,
}

describe('POST /api/users/[id]/approve — unified approve+org-assign (Phase 1 step 7)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(canApproveAccounts).mockReturnValue(true)
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    // Plain (not Once-chained) on purpose: findUnique is called twice per
    // successful approval (beforeAudit, then afterAudit) but several tests in
    // this suite short-circuit with a 400 before the second call ever
    // happens — vi.clearAllMocks() does NOT drain a leftover
    // mockResolvedValueOnce queue, so an unconsumed second value from one
    // test silently becomes the FIRST value the next test sees (e.g. the
    // "not PENDING" 400-bail check firing unexpectedly). Tests that need the
    // before/after audit snapshots to genuinely differ override locally,
    // fully consuming their own queue within that same test.
    vi.mocked(prisma.user.findUnique).mockResolvedValue(pendingUser as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'pending-1' } as never)
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(prisma.department.findUnique).mockResolvedValue(mockDepartment as never)
    vi.mocked(prisma.jobPosition.findUnique).mockResolvedValue(mockJobPosition as never)
  })

  it('approves the account, creates a HIRE EmploymentAssignment row, and returns success', async () => {
    const res = await POST(makeReq(validApproveBody), { params })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data).toEqual({ success: true, status: 'ACTIVE' })

    expect(prisma.employmentAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'pending-1',
        changeType: 'HIRE',
        employmentType: 'FULL_TIME',
        jobPositionId: 'pos-1',
        divisionId: 'div-1',
        departmentId: 'dept-1',
        sectionId: null,
        baseSalary: 25000,
        createdById: 'hr-1',
        effectiveFrom: new Date('2026-09-01'),
      }),
    })
  })

  it('syncs the flat User fields to match (position, department, baseSalary, startDate, employeeType, org ids)', async () => {
    await POST(makeReq(validApproveBody), { params })

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'pending-1', status: 'PENDING' },
      data: expect.objectContaining({
        status: 'ACTIVE',
        position: 'โปรแกรมเมอร์',
        department: 'แผนกไอที',
        divisionId: 'div-1',
        departmentId: 'dept-1',
        sectionId: null,
        employeeType: 'permanent_employee', // mapped from FULL_TIME
        startDate: new Date('2026-09-01'),
        baseSalary: 25000,
      }),
    })
  })

  it('writes an audit log for the approval', async () => {
    // Local override, fully consumed within this one test — before/after must
    // genuinely differ or logEmployeeUpdateIfChanged's diff-check skips the
    // write entirely (by design, matches every other admin-edit audit path).
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(pendingUser as never)
      .mockResolvedValueOnce(activeAfterApproval as never)

    await POST(makeReq(validApproveBody), { params })
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'hr-1',
        targetId: 'pending-1',
        targetType: 'User',
        before: expect.objectContaining({ status: 'PENDING' }),
        after: expect.objectContaining({ status: 'ACTIVE' }),
      }),
    )
  })

  it('creates a new JobPosition (upsert-by-name) when newPositionName is given instead of jobPositionId', async () => {
    vi.mocked(prisma.jobPosition.upsert).mockResolvedValue({ id: 'pos-new', name: 'ตำแหน่งใหม่', isActive: true } as never)
    const { jobPositionId: _jobPositionId, ...bodyWithoutPosition } = validApproveBody
    const res = await POST(makeReq({ ...bodyWithoutPosition, newPositionName: 'ตำแหน่งใหม่' }), { params })

    expect(res.status).toBe(200)
    expect(prisma.jobPosition.upsert).toHaveBeenCalledWith({
      where: { name: 'ตำแหน่งใหม่' },
      update: {},
      create: { name: 'ตำแหน่งใหม่', isActive: true, sortOrder: 0 },
    })
    expect(prisma.jobPosition.findUnique).not.toHaveBeenCalled()
  })

  describe('incomplete data — cannot approve', () => {
    it('rejects when divisionId/departmentId are missing', async () => {
      const { divisionId: _d, departmentId: _dep, ...rest } = validApproveBody
      const res = await POST(makeReq(rest), { params })
      expect(res.status).toBe(400)
      expect(prisma.user.updateMany).not.toHaveBeenCalled()
    })

    it('rejects when neither jobPositionId nor newPositionName is given', async () => {
      const { jobPositionId: _p, ...rest } = validApproveBody
      const res = await POST(makeReq(rest), { params })
      expect(res.status).toBe(400)
      expect(prisma.user.updateMany).not.toHaveBeenCalled()
    })

    it('rejects an invalid employmentType', async () => {
      const res = await POST(makeReq({ ...validApproveBody, employmentType: 'NOT_REAL' }), { params })
      expect(res.status).toBe(400)
      expect(prisma.user.updateMany).not.toHaveBeenCalled()
    })

    it('rejects a missing/invalid startDate', async () => {
      const res = await POST(makeReq({ ...validApproveBody, startDate: 'not-a-date' }), { params })
      expect(res.status).toBe(400)
      expect(prisma.user.updateMany).not.toHaveBeenCalled()
    })

    it('rejects a missing baseSalary from an HR_ADMIN approver (who is required to provide it)', async () => {
      const { baseSalary: _s, ...rest } = validApproveBody
      const res = await POST(makeReq(rest), { params })
      expect(res.status).toBe(400)
      expect(prisma.user.updateMany).not.toHaveBeenCalled()
    })
  })

  describe('baseSalary — hidden and optional for a non-HR_ADMIN approver, but approval still succeeds', () => {
    beforeEach(() => {
      vi.mocked(canApproveAccounts).mockReturnValue(true) // MANAGER here is standing in for a canApproveAccounts role without HR_ADMIN salary rights
      vi.mocked(auth).mockResolvedValue(managerHrSessionNoSalary as never)
    })

    it('approves successfully without baseSalary, and never writes it to User or EmploymentAssignment', async () => {
      const { baseSalary: _s, ...bodyWithoutSalary } = validApproveBody
      const res = await POST(makeReq(bodyWithoutSalary), { params })

      expect(res.status).toBe(200)
      expect(prisma.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.not.objectContaining({ baseSalary: expect.anything() }) }),
      )
      expect(prisma.employmentAssignment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ baseSalary: null }),
      })
    })

    it('silently ignores a baseSalary value sent anyway by an older/smaller client', async () => {
      const res = await POST(makeReq({ ...validApproveBody, baseSalary: 999999 }), { params })
      expect(res.status).toBe(200)
      expect(prisma.employmentAssignment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ baseSalary: null }),
      })
    })
  })

  it('rejects the account with REJECTED status and a rejection notification', async () => {
    const res = await POST(makeReq({ action: 'REJECT', reason: 'เอกสารไม่ครบ' }), { params })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.status).toBe('REJECTED')
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'REJECT' }))
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ACCOUNT_REJECTED', message: expect.stringContaining('เอกสารไม่ครบ') }),
    )
  })

  it('forbids a role without account-approval permission', async () => {
    vi.mocked(canApproveAccounts).mockReturnValue(false)
    const res = await POST(makeReq(validApproveBody), { params })
    expect(res.status).toBe(403)
    expect(prisma.user.updateMany).not.toHaveBeenCalled()
  })

  it('returns 400 when the target user is not PENDING', async () => {
    vi.mocked(prisma.user.findUnique).mockReset().mockResolvedValue({ ...pendingUser, status: 'ACTIVE' } as never)
    const res = await POST(makeReq(validApproveBody), { params })
    expect(res.status).toBe(400)
  })

  it('returns 403 when the target user is outside the approver\'s branch scope', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null as never)
    const res = await POST(makeReq(validApproveBody), { params })
    expect(res.status).toBe(403)
    expect(prisma.user.updateMany).not.toHaveBeenCalled()
  })

  it('does not block the response on createNotification/sendLineNotify resolving (fire-and-forget)', async () => {
    createNotification.mockReturnValue(new Promise(() => {}))
    sendLineNotify.mockReturnValue(new Promise(() => {}))

    const res = await POST(makeReq(validApproveBody), { params })

    expect(res.status).toBe(200)
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'pending-1', type: 'ACCOUNT_APPROVED' }),
    )
    expect(sendLineNotify).toHaveBeenCalledWith(expect.stringContaining('อนุมัติแล้ว'))
  })
})

describe('POST /api/users/[id]/approve — atomic race guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(canApproveAccounts).mockReturnValue(true)
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.user.findUnique).mockResolvedValue(pendingUser as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'pending-1' } as never)
    vi.mocked(prisma.department.findUnique).mockResolvedValue(mockDepartment as never)
    vi.mocked(prisma.jobPosition.findUnique).mockResolvedValue(mockJobPosition as never)
  })

  it('writes via updateMany with a where-guard on status: PENDING', async () => {
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 } as never)
    await POST(makeReq(validApproveBody), { params })
    expect(prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'pending-1', status: 'PENDING' } }),
    )
  })

  it('rejects the loser of a concurrent approve/reject race with 409, and skips audit log + notifications + assignment creation', async () => {
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 0 } as never)
    const res = await POST(makeReq(validApproveBody), { params })
    expect(res.status).toBe(409)
    expect(prisma.employmentAssignment.create).not.toHaveBeenCalled()
    expect(createAuditLog).not.toHaveBeenCalled()
    expect(createNotification).not.toHaveBeenCalled()
    expect(sendLineNotify).not.toHaveBeenCalled()
  })
})
