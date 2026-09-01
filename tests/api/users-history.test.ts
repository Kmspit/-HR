import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/api-guard', () => ({
  requireEditOrgScope: vi.fn(),
  isGuardResponse: (v: unknown) => v instanceof Response,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    auditLog: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    division: { findMany: vi.fn() },
    section: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

import { requireEditOrgScope } from '@/lib/api-guard'
import { prisma } from '@/lib/prisma'
import { snapshotEmployeeForAudit, EMPLOYEE_AUDIT_TRACKING_START } from '@/lib/employee-audit'
import { GET } from '@/app/api/users/[id]/history/route'

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

function makeReq() {
  return new NextRequest('http://localhost/api/users/emp-9/history')
}
const params = (id: string) => Promise.resolve({ id })

const hrSession = { user: { id: 'hr-1', role: 'HR', branchId: 'b1' } }

describe('GET /api/users/[id]/history', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 for a role without edit access, and never queries audit logs', async () => {
    vi.mocked(requireEditOrgScope).mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    )

    const res = await GET(makeReq(), { params: params('emp-9') })
    expect(res.status).toBe(403)
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled()
  })

  it('never leaks the raw nationalId in the response body', async () => {
    vi.mocked(requireEditOrgScope).mockResolvedValue(hrSession as never)
    const before = snapshotEmployeeForAudit(row({ nationalId: '1111111111111' }))
    const after = snapshotEmployeeForAudit(row({ nationalId: '2222222222222' }))
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([{
      id: 'log-1', createdAt: new Date(), before: JSON.stringify(before), after: JSON.stringify(after),
      actor: { name: 'HR คนหนึ่ง' },
    }] as never)
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.division.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.section.findMany).mockResolvedValue([] as never)

    const res = await GET(makeReq(), { params: params('emp-9') })
    const raw = await res.text()
    expect(raw).not.toContain('1111111111111')
    expect(raw).not.toContain('2222222222222')
  })

  it('resolves managerId to a person name, not the raw cuid', async () => {
    vi.mocked(requireEditOrgScope).mockResolvedValue(hrSession as never)
    const before = snapshotEmployeeForAudit(row({ managerId: null }))
    const after = snapshotEmployeeForAudit(row({ managerId: 'mgr-cuid-123' }))
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([{
      id: 'log-1', createdAt: new Date(), before: JSON.stringify(before), after: JSON.stringify(after),
      actor: { name: 'HR' },
    }] as never)
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'mgr-cuid-123', name: 'สมชาย ใจดี' }] as never)
    vi.mocked(prisma.division.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.section.findMany).mockResolvedValue([] as never)

    const res = await GET(makeReq(), { params: params('emp-9') })
    const data = await res.json()
    const changeLine = data.history[0].changes.find((c: string) => c.startsWith('ผู้จัดการ'))
    expect(changeLine).toContain('สมชาย ใจดี')
    expect(changeLine).not.toContain('mgr-cuid-123')

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['mgr-cuid-123'] } } }),
    )
  })

  it('shows "(ไม่พบข้อมูล)" when the referenced manager no longer exists (e.g. deleted) — does not crash', async () => {
    vi.mocked(requireEditOrgScope).mockResolvedValue(hrSession as never)
    const before = snapshotEmployeeForAudit(row({ managerId: null }))
    const after = snapshotEmployeeForAudit(row({ managerId: 'deleted-mgr-id' }))
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([{
      id: 'log-1', createdAt: new Date(), before: JSON.stringify(before), after: JSON.stringify(after),
      actor: { name: 'HR' },
    }] as never)
    // manager row query returns nothing — the id no longer resolves
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.division.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.section.findMany).mockResolvedValue([] as never)

    const res = await GET(makeReq(), { params: params('emp-9') })
    expect(res.status).toBe(200)
    const data = await res.json()
    const changeLine = data.history[0].changes.find((c: string) => c.startsWith('ผู้จัดการ'))
    expect(changeLine).toContain('(ไม่พบข้อมูล)')
    expect(changeLine).not.toContain('deleted-mgr-id')
  })

  it('returns an empty history array with trackingStartedAt when there is no history yet', async () => {
    vi.mocked(requireEditOrgScope).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.division.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.section.findMany).mockResolvedValue([] as never)

    const res = await GET(makeReq(), { params: params('emp-9') })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.history).toEqual([])
    expect(data.trackingStartedAt).toBe(EMPLOYEE_AUDIT_TRACKING_START)
  })

  it('caps the query at 50 most recent rows', async () => {
    vi.mocked(requireEditOrgScope).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.division.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.section.findMany).mockResolvedValue([] as never)

    await GET(makeReq(), { params: params('emp-9') })

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50, orderBy: { createdAt: 'desc' } }),
    )
  })
})
