import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/api-guard', () => ({
  requireAuth: vi.fn(),
  requireOrgScope: vi.fn(),
  requireEditOrgScope: vi.fn(),
  isGuardResponse: (v: unknown) => v instanceof Response,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    employeeProfile: { findUnique: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn((ops: unknown) => Promise.resolve(ops)),
  },
}))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

vi.mock('@/lib/notifications', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth, requireOrgScope, requireEditOrgScope } from '@/lib/api-guard'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/notifications'
import { GET, PUT } from '@/app/api/users/[id]/profile/route'

function auditRow(overrides: Record<string, unknown> = {}) {
  return {
    email: 'a@co.com', phone: null, name: 'ก ข', nameEn: null,
    nickname: null, prefix: null, address: null, addressIdCard: null,
    birthDate: null, nationalId: null, lineId: null,
    role: 'EMPLOYEE', status: 'ACTIVE', startDate: null,
    department: null, position: null, employeeType: null,
    managerId: null, teamLeaderId: null, baseSalary: null,
    socialSecurity: true, isCoworker: false, divisionId: null, sectionId: null,
    employeeProfile: null,
    ...overrides,
  }
}

const FULL_ADDRESS = {
  houseNo: '123', moo: '', soi: '', road: 'ถนนสุขุมวิท', tambon: 'คลองตัน', amphoe: 'วัฒนา', province: 'กรุงเทพมหานคร', postalCode: '10110',
}
const EMPTY_ADDRESS = { houseNo: '', moo: '', soi: '', road: '', tambon: '', amphoe: '', province: '', postalCode: '' }

function makeGet(id: string) {
  return new NextRequest(`http://localhost/api/users/${id}/profile`)
}
function makePut(id: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/users/${id}/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
const params = (id: string) => Promise.resolve({ id })

const hrSession = { user: { id: 'hr-1', role: 'HR', branchId: 'b1' } }

describe('GET /api/users/[id]/profile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passes through a guard-denied response and never queries the DB', async () => {
    vi.mocked(requireAuth).mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) as never)
    const res = await GET(makeGet('emp-9'), { params: params('emp-9') })
    expect(res.status).toBe(401)
    expect(prisma.employeeProfile.findUnique).not.toHaveBeenCalled()
  })

  it('403s a viewer without view scope for someone else', async () => {
    vi.mocked(requireAuth).mockResolvedValue(hrSession as never)
    vi.mocked(requireOrgScope).mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }) as never)
    const res = await GET(makeGet('emp-9'), { params: params('emp-9') })
    expect(res.status).toBe(403)
  })

  it('skips the org-scope check entirely for self-access', async () => {
    const self = { user: { id: 'emp-9', role: 'EMPLOYEE', branchId: 'b1' } }
    vi.mocked(requireAuth).mockResolvedValue(self as never)
    vi.mocked(prisma.employeeProfile.findUnique).mockResolvedValue(null)
    const res = await GET(makeGet('emp-9'), { params: params('emp-9') })
    expect(res.status).toBe(200)
    expect(requireOrgScope).not.toHaveBeenCalled()
  })

  it('returns an all-blank profile, not a 404, when the row does not exist yet (legacy employee)', async () => {
    vi.mocked(requireAuth).mockResolvedValue(hrSession as never)
    vi.mocked(requireOrgScope).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.employeeProfile.findUnique).mockResolvedValue(null)

    const res = await GET(makeGet('emp-9'), { params: params('emp-9') })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.profile.nationality).toBe('')
    expect(data.profile.currentAddress).toEqual(EMPTY_ADDRESS)
    expect(data.profile.sameAsCurrentAddress).toBe(false)
  })

  it('maps a stored profile row into the RegisterAddress shape correctly', async () => {
    vi.mocked(requireAuth).mockResolvedValue(hrSession as never)
    vi.mocked(requireOrgScope).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.employeeProfile.findUnique).mockResolvedValue({
      nationality: 'ไทย', maritalStatus: 'สมรส', personalEmail: 'me@x.com',
      currentHouseNo: '123', currentMoo: null, currentSoi: null, currentRoad: 'ถนนสุขุมวิท',
      currentTambon: 'คลองตัน', currentAmphoe: 'วัฒนา', currentProvince: 'กรุงเทพมหานคร', currentPostalCode: '10110',
      sameAsCurrentAddress: true,
      regHouseNo: '123', regMoo: null, regSoi: null, regRoad: 'ถนนสุขุมวิท',
      regTambon: 'คลองตัน', regAmphoe: 'วัฒนา', regProvince: 'กรุงเทพมหานคร', regPostalCode: '10110',
    } as never)

    const res = await GET(makeGet('emp-9'), { params: params('emp-9') })
    const data = await res.json()
    expect(data.profile.nationality).toBe('ไทย')
    expect(data.profile.currentAddress).toEqual(FULL_ADDRESS)
    expect(data.profile.sameAsCurrentAddress).toBe(true)
  })
})

describe('PUT /api/users/[id]/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue(hrSession as never)
    vi.mocked(requireEditOrgScope).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.user.findUnique).mockResolvedValue(auditRow() as never)
    vi.mocked(prisma.employeeProfile.upsert).mockResolvedValue({} as never)
    vi.mocked(prisma.user.update).mockResolvedValue({} as never)
  })

  it('403s a non-edit-scope viewer and never writes anything', async () => {
    vi.mocked(requireEditOrgScope).mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }) as never)
    const res = await PUT(makePut('emp-9', { currentAddress: FULL_ADDRESS }), { params: params('emp-9') })
    expect(res.status).toBe(403)
    expect(prisma.employeeProfile.upsert).not.toHaveBeenCalled()
  })

  it('404s when the target user does not exist', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    const res = await PUT(makePut('emp-9', {}), { params: params('emp-9') })
    expect(res.status).toBe(404)
  })

  it('400s a partially filled address and never writes', async () => {
    const res = await PUT(
      makePut('emp-9', { currentAddress: { ...EMPTY_ADDRESS, houseNo: '1' } }),
      { params: params('emp-9') },
    )
    expect(res.status).toBe(400)
    expect(prisma.employeeProfile.upsert).not.toHaveBeenCalled()
  })

  it('400s a malformed personalEmail', async () => {
    const res = await PUT(makePut('emp-9', { personalEmail: 'not-an-email' }), { params: params('emp-9') })
    expect(res.status).toBe(400)
  })

  it('accepts an entirely blank submission (first-time tab open, nothing filled in yet)', async () => {
    const res = await PUT(makePut('emp-9', {}), { params: params('emp-9') })
    expect(res.status).toBe(200)
    expect(prisma.employeeProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'emp-9' },
        create: expect.objectContaining({ userId: 'emp-9', nationality: null, currentHouseNo: null }),
      }),
    )
  })

  it('upserts a filled profile and syncs User.address/addressIdCard from the same structured data', async () => {
    const res = await PUT(
      makePut('emp-9', {
        nationality: 'ไทย',
        currentAddress: FULL_ADDRESS,
        sameAsCurrentAddress: true,
        registeredAddress: EMPTY_ADDRESS,
      }),
      { params: params('emp-9') },
    )
    expect(res.status).toBe(200)

    expect(prisma.employeeProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ currentHouseNo: '123', regHouseNo: '123' }),
      }),
    )
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'emp-9' },
        data: expect.objectContaining({
          address: expect.stringContaining('123'),
          addressIdCard: expect.stringContaining('123'),
        }),
      }),
    )
  })

  it('never trusts the client copy of registeredAddress when sameAsCurrentAddress is true — re-derives from currentAddress', async () => {
    await PUT(
      makePut('emp-9', {
        currentAddress: FULL_ADDRESS,
        sameAsCurrentAddress: true,
        // A stale/mismatched client payload — must be ignored server-side.
        registeredAddress: { ...FULL_ADDRESS, province: 'เชียงใหม่' },
      }),
      { params: params('emp-9') },
    )
    const call = vi.mocked(prisma.employeeProfile.upsert).mock.calls[0][0] as { create: { regProvince: string } }
    expect(call.create.regProvince).toBe('กรุงเทพมหานคร')
  })

  it('writes an audit log when something actually changed', async () => {
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(auditRow({ employeeProfile: null }) as never)
      .mockResolvedValueOnce(auditRow({ employeeProfile: { nationality: 'ไทย' } }) as never)

    await PUT(makePut('emp-9', { nationality: 'ไทย' }), { params: params('emp-9') })
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'hr-1', targetId: 'emp-9', targetType: 'User', action: 'UPDATE' }),
    )
  })

  it('does not write an audit log when nothing actually changed', async () => {
    const row = auditRow({ employeeProfile: null })
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(row as never)
      .mockResolvedValueOnce(row as never)

    await PUT(makePut('emp-9', {}), { params: params('emp-9') })
    expect(createAuditLog).not.toHaveBeenCalled()
  })
})
