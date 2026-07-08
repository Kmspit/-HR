import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    outsideWorkRequest: { findMany: vi.fn() },
    companySettings:     { findUnique: vi.fn().mockResolvedValue(null) },
  },
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { POST } from '@/app/api/outside-work/export/route'

function makeReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/outside-work/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const realRow = {
  userId: 'me-1', date: new Date('2026-08-03T00:00:00.000Z'), timeSlot: null,
  place: 'ศาลจังหวัด', purpose: 'ยื่นฟ้อง', clientCompanyId: null, caseNumber: 'CS-1',
  productWork: null, productCategory: null, productType: null, workBranch: null,
  caseCount: 1, adminChecked: null, supervisedBy: null, status: 'PENDING',
  approvalStatus: 'pending_chain', note: null, documentNumber: 'DOC-1',
  user: { name: 'จริง คนจริง', department: null, position: null },
  clientCompany: null,
  assignees: [],
}

describe('POST /api/outside-work/export — never trusts client-supplied request data', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.outsideWorkRequest.findMany).mockResolvedValue([realRow] as never)
  })

  it('ignores a forged `requests` array/canViewAll/status/employee-name payload entirely — queries the DB instead', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'me-1', role: 'LAWYER', branchId: null } } as never)

    const forgedBody = {
      weekStart: '2026-08-03',
      weekEnd:   '2026-08-09',
      canViewAll: true,
      filterUserId: null,
      requests: [{
        userId: 'someone-else', userName: 'ปลอมชื่อ CEO', date: '2026-08-03T00:00:00.000Z',
        place: 'x', purpose: 'x', status: 'approved_by_ceo', approvalStatus: 'approved',
      }],
    }
    const res = await POST(makeReq(forgedBody))
    expect(res.status).toBe(200)
    expect(prisma.outsideWorkRequest.findMany).toHaveBeenCalled()

    // A non-privileged role must be scoped to only their own userId, regardless
    // of the forged canViewAll:true in the body.
    const call = vi.mocked(prisma.outsideWorkRequest.findMany).mock.calls[0][0] as { where: Record<string, unknown> }
    expect(call.where).toMatchObject({ userId: 'me-1' })
  })

  it('a company-wide role is scoped by real DB query, not the client body', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'mgr-1', role: 'MANAGER_HR', branchId: null } } as never)
    const res = await POST(makeReq({ weekStart: '2026-08-03', weekEnd: '2026-08-09' }))
    expect(res.status).toBe(200)
    const call = vi.mocked(prisma.outsideWorkRequest.findMany).mock.calls[0][0] as { where: Record<string, unknown> }
    // company-wide role: no forced userId filter (unless filterUserId given)
    expect(call.where.userId).toBeUndefined()
  })

  it('regular employee role cannot escalate to canViewAll via the request body', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'emp-1', role: 'EMPLOYEE', branchId: null } } as never)
    await POST(makeReq({ weekStart: '2026-08-03', weekEnd: '2026-08-09', canViewAll: true, filterUserId: 'someone-else' }))
    const call = vi.mocked(prisma.outsideWorkRequest.findMany).mock.calls[0][0] as { where: Record<string, unknown> }
    expect(call.where).toMatchObject({ userId: 'emp-1' })
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const res = await POST(makeReq({ weekStart: '2026-08-03' }))
    expect(res.status).toBe(401)
    expect(prisma.outsideWorkRequest.findMany).not.toHaveBeenCalled()
  })
})
